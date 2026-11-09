import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Client } from "pg";
import { normalizeListingKey } from "../matching/listing-key";
import { SightingMatcher } from "../matching/sighting-matcher";
import { PrismaService } from "../prisma/prisma.service";
import { AlertHook } from "./alert-hook";
import {
  AdapterError,
  AdapterResult,
  BoardReport,
  JOB_SOURCE_ADAPTERS,
  JobSourceAdapter,
} from "./job-source-adapter";
import { AdapterOutcome, PollHooks } from "./poll-hooks";

export const INGEST_OPTIONS = Symbol("INGEST_OPTIONS");

export interface IngestOptions {
  // The advisory lock needs a connection of its own, because a pooled one can change between queries.
  lockUrl: string;
  intervalMs?: number;
}

const HOUR_MS = 60 * 60 * 1000;
export const INGEST_LOCK_ID = 2100021;
// A window reaches back past the last good poll, so a late or interrupted poll leaves no gap.
const OVERLAP_MS = 2 * HOUR_MS;
const FIRST_LOOKBACK_MS = 24 * HOUR_MS;
const MAX_LOOKBACK_MS = 7 * 24 * HOUR_MS;
// Tick times jitter by milliseconds, so an hourly adapter must not be skipped for arriving a hair early.
const INTERVAL_GRACE_MS = 60 * 1000;
const NOT_FOUND_ALERT_MS = 24 * HOUR_MS;
// A listing missing from one complete read may be a bad page, so it must stay missing this long.
const CLOSE_GRACE_MS = 24 * HOUR_MS;

// Only these stop the window from advancing. A bad row never gets better by asking again.
const RETRYABLE: AdapterError["kind"][] = ["blocked", "fault"];

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class IngestScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(IngestScheduler.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private current?: Promise<unknown>;
  // Lost on restart, which costs at most one repeat alert per dead board.
  private readonly notFoundAlertedAt = new Map<number, Date>();

  constructor(
    @Inject(JOB_SOURCE_ADAPTERS) private readonly adapters: JobSourceAdapter[],
    private readonly matcher: SightingMatcher,
    private readonly prisma: PrismaService,
    private readonly alerts: AlertHook,
    private readonly hooks: PollHooks,
    @Inject(INGEST_OPTIONS) private readonly options: IngestOptions,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.safeTick(),
      this.options.intervalMs ?? HOUR_MS,
    );
    void this.safeTick();
  }

  // Runs before PrismaService disconnects, so the adapter in progress can still write.
  async onModuleDestroy() {
    await this.drain();
  }

  async drain(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.timer = undefined;
    await this.current?.catch(() => undefined);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Poll failed: ${describe(err)}`);
    }
  }

  async tick(now: Date = new Date()): Promise<AdapterOutcome[] | "skipped"> {
    if (this.stopping) return "skipped";
    const lock = new Client({ connectionString: this.options.lockUrl });
    // An unheard "error" from a dead idle socket kills the process mid-batch; see the ingest scheduler gotcha.
    lock.on("error", (err) =>
      this.logger.error(`Lost the ingest lock connection: ${describe(err)}`),
    );
    await lock.connect();
    try {
      const { rows } = await lock.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS locked",
        [INGEST_LOCK_ID],
      );
      if (!rows[0].locked) {
        this.logger.log("Previous poll still running; skipping this tick");
        return "skipped";
      }
      const run = this.pollAll(now);
      this.current = run;
      return await run;
    } finally {
      // Ending the connection also drops the session lock.
      await lock.end().catch(() => undefined);
    }
  }

  private async pollAll(now: Date): Promise<AdapterOutcome[]> {
    const outcomes: AdapterOutcome[] = [];
    for (const adapter of this.adapters) {
      outcomes.push(
        this.stopping
          ? this.skipped(adapter)
          : await this.pollOne(adapter, now),
      );
    }
    try {
      await this.hooks.pollFinished(outcomes);
    } catch (err) {
      this.logger.error(`pollFinished failed: ${describe(err)}`);
    }
    return outcomes;
  }

  private skipped(adapter: JobSourceAdapter): AdapterOutcome {
    return {
      adapter: adapter.name,
      status: "skipped",
      drafts: 0,
      matched: 0,
      failedDrafts: 0,
      errors: [],
      durationMs: 0,
    };
  }

  private async pollOne(
    adapter: JobSourceAdapter,
    now: Date,
  ): Promise<AdapterOutcome> {
    const started = Date.now();
    const outcome = this.skipped(adapter);
    let advanced = false;
    let attempted = false;
    try {
      const cursor = await this.prisma.ingestCursor.findUnique({
        where: { adapter: adapter.name },
      });
      if (
        cursor?.lastAttemptAt &&
        now.getTime() - cursor.lastAttemptAt.getTime() + INTERVAL_GRACE_MS <
          adapter.minIntervalMs
      ) {
        return outcome;
      }
      attempted = true;
      const since = new Date(
        Math.max(
          cursor?.lastPollAt
            ? cursor.lastPollAt.getTime() - OVERLAP_MS
            : now.getTime() - FIRST_LOOKBACK_MS,
          now.getTime() - MAX_LOOKBACK_MS,
        ),
      );
      const result = await adapter.poll({
        since,
        now,
        shouldStop: () => this.stopping,
      });
      outcome.drafts = result.drafts.length;
      outcome.errors = [...result.errors];
      if (result.boards) outcome.boards = countBoards(result.boards);

      for (const draft of result.drafts) {
        try {
          await this.matcher.matchSighting(draft, { now });
          outcome.matched++;
        } catch (err) {
          outcome.failedDrafts++;
          outcome.errors.push({
            // The matcher rejects with BadRequest only drafts that a rerun would send again unchanged.
            kind: err instanceof BadRequestException ? "bad-row" : "fault",
            message: `draft ${draft.listingKey}: ${describe(err)}`,
          });
        }
      }

      await this.closeMissing(result, now, outcome);

      const retry = outcome.errors.some((e) => RETRYABLE.includes(e.kind));
      outcome.status = retry ? "failed" : "ok";
      advanced = !retry;
      await this.alertBoardErrors(adapter, outcome.errors, now);
    } catch (err) {
      outcome.status = "failed";
      outcome.errors.push({ kind: "fault", message: describe(err) });
      await this.alerts
        .alert({ kind: "fault", adapter: adapter.name, message: describe(err) })
        .catch(() => undefined);
    }
    if (attempted) {
      const failure = await this.recordAttempt(adapter, now, advanced);
      if (failure) {
        outcome.status = "failed";
        outcome.errors.push({ kind: "fault", message: failure });
        await this.alerts
          .alert({ kind: "fault", adapter: adapter.name, message: failure })
          .catch(() => undefined);
      }
    }
    outcome.durationMs = Date.now() - started;
    return outcome;
  }

  // Only a complete board listing is evidence; see the "Only boards close a Posting" decision.
  private async closeMissing(
    result: AdapterResult,
    now: Date,
    outcome: AdapterOutcome,
  ) {
    for (const id of result.completeBoards) {
      const listed = new Set(
        result.drafts
          .filter((d) => d.watchedCompanyId === id)
          .map((d) => normalizeListingKey(d.listingKey)),
      );
      const openOnBoard = { watchedCompanyId: id, closedAt: null };
      const rows = result.boards?.find((b) => b.watchedCompanyId === id)?.rows;
      if (listed.size === 0 && !rows) {
        const count = await this.prisma.sighting.count({ where: openOnBoard });
        if (count > 0) {
          // No watchedCompanyId on the error: a board that really emptied would alert every hour.
          outcome.errors.push({
            kind: "fault",
            message: `board of company ${id} listed no jobs but has ${count} open; closed none`,
          });
        }
        continue;
      }
      await this.prisma.sighting.updateMany({
        where: {
          ...openOnBoard,
          listingKey: { notIn: [...listed] },
          lastSeenAt: { lt: new Date(now.getTime() - CLOSE_GRACE_MS) },
        },
        data: { closedAt: now },
      });
    }
  }

  private async recordAttempt(
    adapter: JobSourceAdapter,
    now: Date,
    advanced: boolean,
  ): Promise<string | undefined> {
    const data = advanced
      ? { lastAttemptAt: now, lastPollAt: now }
      : { lastAttemptAt: now };
    try {
      await this.prisma.ingestCursor.upsert({
        where: { adapter: adapter.name },
        create: { adapter: adapter.name, ...data },
        update: data,
      });
      return undefined;
    } catch (err) {
      return `could not record the attempt: ${describe(err)}`;
    }
  }

  // Board errors alert here, not in the adapter, because the daily 404 limit needs one place that sees every tick.
  private async alertBoardErrors(
    adapter: JobSourceAdapter,
    errors: AdapterError[],
    now: Date,
  ) {
    for (const e of errors) {
      if (e.watchedCompanyId === undefined || !RETRYABLE.includes(e.kind)) {
        continue;
      }
      const id = e.watchedCompanyId;
      if (e.httpStatus === 404) {
        const last = this.notFoundAlertedAt.get(id);
        if (last && now.getTime() - last.getTime() < NOT_FOUND_ALERT_MS) {
          continue;
        }
      }
      try {
        const company = await this.prisma.company.findUnique({ where: { id } });
        await this.alerts.alert({
          kind: e.kind as "blocked" | "fault",
          adapter: adapter.name,
          company: company?.name ?? `company ${id}`,
          message: e.message,
        });
        if (e.httpStatus === 404) this.notFoundAlertedAt.set(id, now);
      } catch (err) {
        this.logger.error(`Board alert failed: ${describe(err)}`);
      }
    }
  }
}

function countBoards(boards: BoardReport[]) {
  const count = { ok: 0, failed: 0, incomplete: 0 };
  for (const b of boards) count[b.status]++;
  return count;
}

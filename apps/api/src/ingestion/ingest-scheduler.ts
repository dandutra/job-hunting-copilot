import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { Client } from "pg";
import { SightingMatcher } from "../matching/sighting-matcher";
import { PrismaService } from "../prisma/prisma.service";
import { AlertHook } from "./alert-hook";
import {
  AdapterError,
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
const INGEST_LOCK_ID = 2100021;
// A window reaches back past the last good poll, so a late or interrupted poll leaves no gap.
const OVERLAP_MS = 2 * HOUR_MS;
const FIRST_LOOKBACK_MS = 24 * HOUR_MS;
const MAX_LOOKBACK_MS = 7 * 24 * HOUR_MS;

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
    try {
      const cursor = await this.prisma.ingestCursor.findUnique({
        where: { adapter: adapter.name },
      });
      const since = new Date(
        Math.max(
          cursor
            ? cursor.lastPollAt.getTime() - OVERLAP_MS
            : now.getTime() - FIRST_LOOKBACK_MS,
          now.getTime() - MAX_LOOKBACK_MS,
        ),
      );
      const result = await adapter.poll({ since, now });
      outcome.drafts = result.drafts.length;
      outcome.errors = [...result.errors];

      for (const draft of result.drafts) {
        try {
          await this.matcher.matchSighting(draft, { now });
          outcome.matched++;
        } catch (err) {
          outcome.failedDrafts++;
          outcome.errors.push({
            kind: "fault",
            message: `draft ${draft.listingKey}: ${describe(err)}`,
          });
        }
      }

      const retry = outcome.errors.some((e) => RETRYABLE.includes(e.kind));
      outcome.status = retry ? "failed" : "ok";
      if (!retry) {
        await this.prisma.ingestCursor.upsert({
          where: { adapter: adapter.name },
          create: { adapter: adapter.name, lastPollAt: now },
          update: { lastPollAt: now },
        });
      }
    } catch (err) {
      outcome.status = "failed";
      outcome.errors.push({ kind: "fault", message: describe(err) });
      await this.alerts
        .alert({ kind: "fault", adapter: adapter.name, message: describe(err) })
        .catch(() => undefined);
    }
    outcome.durationMs = Date.now() - started;
    return outcome;
  }
}

import { Inject, Injectable, Logger } from "@nestjs/common";
import { fitSummary, validateProfile } from "master-profile";
import { postingState } from "../matching/posting-state";
import { PrismaService } from "../prisma/prisma.service";
import { JevCallError, JevClient } from "./jev-client";
import {
  invalidAnswers,
  judgementState,
  QUESTION_SET_VERSION,
} from "./question-set";
import { titleFiltered } from "./title-filter";

// The batch runs under the ingest lock, so it must end well inside the hourly tick; the rest waits for the next poll.
const RUN_BUDGET_MS = 20 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Each call is about 5,000 input tokens; see the "Jev judges a narrow set of Postings" decision.
const WINDOW_DAYS = 14;
const DAILY_CALL_CAP = 150;
// A Posting that fails through its own fault this many times is left alone.
const MAX_POSTING_FAILURES = 3;

export interface RunOptions {
  now?: Date;
  shouldStop?: () => boolean;
  budgetMs?: number;
  // Limits the run to these Postings, for a manual sample.
  postingIds?: number[];
}

export interface RunCounts {
  found: number;
  judged: number;
  failed: number;
  // Due Postings left because the daily cap was reached.
  capped: number;
  // Postings in the window or sample whose title the Title filter keeps away from Jev.
  filtered: number;
}

// Said by name only; an error's own text can quote the request.
function why(err: unknown): string {
  return err instanceof JevCallError ? err.message : "unexpected error";
}

// Statuses a bad request body explains. Any other 4xx (a revoked key, a used-up quota, a retired model pin) is Jev's or ours, and would retire every Posting it touched.
const POSTING_FAULT_STATUSES = new Set([400, 413, 422]);

// The Posting's own fault: an unusable answer or a request Jev rejected for its content. Anything else ends the run.
function isPostingFault(err: unknown): err is JevCallError {
  if (!(err instanceof JevCallError)) return false;
  if (err.kind === "invalid") return true;
  return (
    err.kind === "http" &&
    err.status !== undefined &&
    POSTING_FAULT_STATUSES.has(err.status)
  );
}

// Reads what needs judging from the tables on every run, so a failed call retries on the next poll with no queue.
@Injectable()
export class JevRunner {
  private readonly logger = new Logger(JevRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    // Null when TYPESAFE_API_KEY is empty, as in local development.
    @Inject(JevClient) private readonly jev: JevClient | null,
  ) {}

  async run(options: RunOptions = {}): Promise<RunCounts> {
    const now = options.now ?? new Date();
    const shouldStop = options.shouldStop ?? (() => false);
    const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
    const counts: RunCounts = {
      found: 0,
      judged: 0,
      failed: 0,
      capped: 0,
      filtered: 0,
    };
    const jev = this.jev;
    if (!jev) return counts;
    const profile = await this.prisma.masterProfileVersion.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (!profile) {
      this.logger.warn("No Master profile version yet; judging nothing");
      return counts;
    }
    const parsed = validateProfile(profile.rawYaml);
    if (!parsed.ok) {
      this.logger.error(
        `Master profile version ${profile.id.slice(0, 12)} no longer validates; judging nothing`,
      );
      return counts;
    }
    const summary = fitSummary(parsed.profile);

    const sample = options.postingIds !== undefined;
    const postings = await this.prisma.posting.findMany({
      where: sample
        ? { id: { in: options.postingIds } }
        : {
            postedAt: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY_MS) },
          },
      select: {
        id: true,
        title: true,
        postedAt: true,
        descriptionKind: true,
        sightings: {
          select: { watchedCompanyId: true, lastSeenAt: true, closedAt: true },
        },
        jevJudgements: {
          select: { profileVersionId: true, descriptionKind: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
        _count: { select: { jevFailures: true } },
      },
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    });

    const due = postings.filter((p) => {
      // Never judged, whatever the reason or the sample.
      if (titleFiltered(p.title)) {
        counts.filtered++;
        return false;
      }
      if (p._count.jevFailures >= MAX_POSTING_FAILURES) return false;
      // A manual sample is the user's pick, so it skips the open check along with the window.
      if (!sample && postingState(p.sightings, now) !== "open") return false;
      const latest = p.jevJudgements[0];
      if (!latest) return true;
      if (latest.descriptionKind !== "full" && p.descriptionKind === "full")
        return true;
      return latest.profileVersionId !== profile.id;
    });
    counts.found = due.length;

    // Counts rows, so a call that stored nothing is not counted; see the gotcha.
    let callsLeft = sample
      ? Infinity
      : DAILY_CALL_CAP -
        (await this.callsSince(new Date(now.getTime() - DAY_MS)));

    for (const [index, { id }] of due.entries()) {
      if (shouldStop() || Date.now() >= deadline) break;
      if (callsLeft <= 0) {
        counts.capped = due.length - index;
        break;
      }
      try {
        await this.judge(jev, id, profile.id, summary);
        counts.judged++;
        callsLeft--;
      } catch (err) {
        counts.failed++;
        this.logger.warn(`Posting ${id} stays unjudged: ${why(err)}`);
        if (!isPostingFault(err)) {
          // Jev is down or limiting us; one more call per Posting would only repeat it.
          this.logger.warn("Jev is unavailable; ending the run");
          break;
        }
        await this.prisma.jevFailure.create({
          data: { postingId: id, kind: err.kind, status: err.status },
        });
        callsLeft--;
      }
    }
    this.logger.log(
      `Jev run: ${counts.found} due, ${counts.judged} judged, ${counts.failed} failed, ${counts.capped} capped, ${counts.filtered} filtered, ${counts.found - counts.judged - counts.failed - counts.capped} left for the next poll`,
    );
    return counts;
  }

  private async callsSince(since: Date): Promise<number> {
    const [judged, failed] = await Promise.all([
      this.prisma.jevJudgement.count({ where: { createdAt: { gt: since } } }),
      this.prisma.jevFailure.count({ where: { createdAt: { gt: since } } }),
    ]);
    return judged + failed;
  }

  private async judge(
    jev: JevClient,
    postingId: number,
    profileId: string,
    summary: string,
  ) {
    const posting = await this.prisma.posting.findUniqueOrThrow({
      where: { id: postingId },
    });
    const response = await jev.ask(judgementState(posting, summary));
    if (invalidAnswers(response.answers)) throw new JevCallError("invalid");
    await this.prisma.jevJudgement.create({
      data: {
        postingId,
        profileVersionId: profileId,
        questionSetVersion: QUESTION_SET_VERSION,
        descriptionKind: posting.descriptionKind,
        model: response.model,
        answers: response.answers as object,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    });
  }
}

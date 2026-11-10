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

// The batch runs under the ingest lock, so it must end well inside the hourly tick; the rest waits for the next poll.
const RUN_BUDGET_MS = 20 * 60 * 1000;

export interface RunOptions {
  now?: Date;
  shouldStop?: () => boolean;
  budgetMs?: number;
}

export interface RunCounts {
  found: number;
  judged: number;
  failed: number;
}

// Said by name only; an error's own text can quote the request.
function why(err: unknown): string {
  return err instanceof JevCallError ? err.message : "unexpected error";
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
    const counts: RunCounts = { found: 0, judged: 0, failed: 0 };
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

    const postings = await this.prisma.posting.findMany({
      select: {
        id: true,
        descriptionKind: true,
        sightings: {
          select: { watchedCompanyId: true, lastSeenAt: true, closedAt: true },
        },
        jevJudgements: {
          select: { profileVersionId: true, descriptionKind: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: { id: "asc" },
    });

    const due = postings.filter((p) => {
      const latest = p.jevJudgements[0];
      if (!latest) return true;
      if (latest.descriptionKind !== "full" && p.descriptionKind === "full")
        return true;
      return (
        latest.profileVersionId !== profile.id &&
        postingState(p.sightings, now) === "open"
      );
    });
    counts.found = due.length;

    for (const { id } of due) {
      if (shouldStop() || Date.now() >= deadline) break;
      try {
        await this.judge(jev, id, profile.id, summary);
        counts.judged++;
      } catch (err) {
        counts.failed++;
        this.logger.warn(`Posting ${id} stays unjudged: ${why(err)}`);
      }
    }
    this.logger.log(
      `Jev run: ${counts.found} due, ${counts.judged} judged, ${counts.failed} failed, ${counts.found - counts.judged - counts.failed} left for the next poll`,
    );
    return counts;
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

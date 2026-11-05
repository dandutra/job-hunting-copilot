import { Injectable, Logger } from "@nestjs/common";
import { AdapterError } from "./job-source-adapter";

export interface AdapterOutcome {
  adapter: string;
  // "failed" means the window was not advanced, so the next poll covers it again.
  status: "ok" | "failed" | "skipped";
  drafts: number;
  matched: number;
  failedDrafts: number;
  errors: AdapterError[];
  // Only board adapters report these.
  boards?: { ok: number; failed: number; incomplete: number };
  durationMs: number;
}

// Heartbeats and the disk alert attach here; an abstract class doubles as the Nest injection token.
export abstract class PollHooks {
  abstract pollFinished(outcomes: AdapterOutcome[]): Promise<void>;
}

@Injectable()
export class LogPollHooks extends PollHooks {
  private readonly logger = new Logger("Poll");

  async pollFinished(outcomes: AdapterOutcome[]): Promise<void> {
    for (const o of outcomes) {
      this.logger.log(
        `${o.adapter} ${o.status}: ${o.drafts} drafts, ${o.matched} matched, ${o.failedDrafts} failed, ${o.errors.length} errors, ${o.durationMs} ms${o.boards ? `, boards ${o.boards.ok} ok ${o.boards.failed} failed ${o.boards.incomplete} incomplete` : ""}`,
      );
      for (const e of o.errors) {
        this.logger.warn(`${o.adapter} ${e.kind}: ${e.message}`);
      }
    }
  }
}

import { Logger, OnModuleInit } from "@nestjs/common";
import { AdapterOutcome, LogPollHooks, PollHooks } from "./poll-hooks";

const PING_TIMEOUT_MS = 10_000;

// Silence raises the alarm. An all-skipped poll still pings, because a restart's first poll skips every adapter not yet due.
export class HeartbeatPollHooks extends PollHooks implements OnModuleInit {
  private readonly logger = new Logger("Heartbeat");

  private readonly log = new LogPollHooks();

  constructor(private readonly url: string) {
    super();
  }

  onModuleInit(): void {
    if (!this.url) {
      this.logger.warn("HEARTBEAT_URL is empty; no heartbeat will be sent");
    }
  }

  async pollFinished(outcomes: AdapterOutcome[]): Promise<void> {
    await this.log.pollFinished(outcomes);
    if (!this.url) return;
    const ran = outcomes.filter((o) => o.status !== "skipped");
    if (ran.length > 0 && !ran.some((o) => o.status === "ok")) {
      this.logger.warn("Every adapter that ran failed; sending no heartbeat");
      return;
    }
    try {
      const res = await fetch(this.url, {
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      if (!res.ok) this.logger.error(`Heartbeat answered ${res.status}`);
    } catch (err) {
      this.logger.error(
        `Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

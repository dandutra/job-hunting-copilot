import { Logger, OnModuleInit } from "@nestjs/common";
import { AdapterOutcome, LogPollHooks, PollHooks } from "./poll-hooks";

const PING_TIMEOUT_MS = 10_000;

// A ping per poll with at least one working adapter; silence is what raises the alarm.
export class HeartbeatPollHooks extends PollHooks implements OnModuleInit {
  private readonly logger = new Logger("Heartbeat");

  constructor(
    private readonly url: string,
    private readonly log: PollHooks = new LogPollHooks(),
    private readonly fetchFn: typeof fetch = fetch,
  ) {
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
    if (!outcomes.some((o) => o.status === "ok")) {
      this.logger.warn("No adapter succeeded; sending no heartbeat");
      return;
    }
    try {
      const res = await this.fetchFn(this.url, {
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

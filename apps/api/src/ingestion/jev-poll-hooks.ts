import { OnModuleInit } from "@nestjs/common";
import { JevRunner } from "../jev/jev-runner";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { AdapterOutcome, PollHooks } from "./poll-hooks";

// Judging runs after the heartbeat, so a slow batch of Jev calls can't silence it.
export class JevPollHooks extends PollHooks implements OnModuleInit {
  constructor(
    private readonly inner: HeartbeatPollHooks,
    private readonly jev: JevRunner,
  ) {
    super();
  }

  onModuleInit(): void {
    this.inner.onModuleInit();
  }

  async pollFinished(outcomes: AdapterOutcome[]): Promise<void> {
    await this.inner.pollFinished(outcomes);
    await this.jev.run();
  }
}

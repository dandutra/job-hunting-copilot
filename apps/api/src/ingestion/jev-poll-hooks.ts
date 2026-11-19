import { Logger, OnModuleInit } from "@nestjs/common";
import { TierConfigSource } from "../feed/tier-config-source";
import { JevRunner } from "../jev/jev-runner";
import { PrismaService } from "../prisma/prisma.service";
import { recomputeTiers } from "../tiers/recompute";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { AdapterOutcome, PollHooks } from "./poll-hooks";

// Judging runs after the heartbeat, so a slow batch of Jev calls can't silence it. The Tier recompute runs last, so the feed shows the batch just judged.
export class JevPollHooks extends PollHooks implements OnModuleInit {
  private readonly logger = new Logger("TierRecompute");

  constructor(
    private readonly inner: HeartbeatPollHooks,
    private readonly jev: JevRunner,
    private readonly tierConfig: TierConfigSource,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.inner.onModuleInit();
  }

  async pollFinished(
    outcomes: AdapterOutcome[],
    shouldStop: () => boolean = () => false,
  ): Promise<void> {
    await this.inner.pollFinished(outcomes);
    await this.jev.run({ shouldStop });
    // Runs every poll, even with nothing judged, so a config or Title filter change lands within the hour.
    if (!shouldStop()) await this.recompute();
  }

  // A failure is logged, never thrown: the poll is already recorded and the old Tiers stay.
  private async recompute(): Promise<void> {
    const started = Date.now();
    try {
      const { config, version } = this.tierConfig.load();
      const c = await recomputeTiers(this.prisma, config, version, (line) =>
        this.logger.warn(line),
      );
      this.logger.log(
        `found=${c.found} processed=${c.processed} skipped=${c.skipped} failed=${c.failed} durationMs=${Date.now() - started}`,
      );
    } catch (err) {
      this.logger.error(
        `Tier recompute failed after ${Date.now() - started} ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

import { Logger, OnModuleInit } from "@nestjs/common";
import { discoverBoards } from "../companies/discover-boards";
import { TierConfigSource } from "../feed/tier-config-source";
import { JevRunner } from "../jev/jev-runner";
import { PrismaService } from "../prisma/prisma.service";
import { recomputeTiers } from "../tiers/recompute";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { AdapterOutcome, PollHooks } from "./poll-hooks";

// Judging runs after the heartbeat, so a slow batch of Jev calls can't silence it. Board discovery runs between them, so the next poll reads the boards it adds. The Tier recompute runs last, so the feed shows the batch just judged.
export class JevPollHooks extends PollHooks implements OnModuleInit {
  private readonly logger = new Logger("TierRecompute");
  private readonly discoveryLogger = new Logger("BoardDiscovery");

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
    if (!shouldStop()) await this.discover();
    await this.jev.run({ shouldStop });
    // Runs every poll, even with nothing judged, so a config or Title filter change lands within the hour.
    if (!shouldStop()) await this.recompute();
  }

  // A failure is logged, never thrown, so it can't stop the Jev batch: the boards stay as they were.
  private async discover(): Promise<void> {
    const started = Date.now();
    try {
      const counts = await discoverBoards(this.prisma, (line) =>
        this.discoveryLogger.log(line),
      );
      this.discoveryLogger.log(
        `found=${counts.found} processed=${counts.processed} skipped=${counts.skipped} failed=${counts.failed} durationMs=${Date.now() - started}`,
      );
    } catch (err) {
      this.discoveryLogger.error(
        `Board discovery failed after ${Date.now() - started} ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // A failure is logged, never thrown: the poll is already recorded and the old Tiers stay.
  private async recompute(): Promise<void> {
    const started = Date.now();
    try {
      const { config, version } = this.tierConfig.load();
      // One line per failed Posting would repeat every hour, so only the first few are kept.
      const failures: string[] = [];
      const counts = await recomputeTiers(
        this.prisma,
        config,
        version,
        (line) => failures.push(line),
      );
      const line = `found=${counts.found} processed=${counts.processed} skipped=${counts.skipped} filtered=${counts.filtered} failed=${counts.failed} durationMs=${Date.now() - started}`;
      if (counts.failed > 0) {
        this.logger.warn(
          `${line}; first failures: ${failures.slice(0, 3).join(" | ")}`,
        );
      } else {
        this.logger.log(line);
      }
    } catch (err) {
      this.logger.error(
        `Tier recompute failed after ${Date.now() - started} ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

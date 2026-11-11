import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AlertHook } from "../ingestion/alert-hook";
import { PrismaService } from "../prisma/prisma.service";
import { FeedCorrectionBodyDto } from "./labels.dto";
import { Clock } from "./labels-env";
import { underLabelsLock } from "./queue-lock";

const ALERT_AFTER = 3;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FeedCorrectionService {
  private readonly logger = new Logger(FeedCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly alerts: AlertHook,
  ) {}

  async correct(
    postingId: number,
    body: FeedCorrectionBodyDto,
  ): Promise<{ id: number }> {
    const now = this.clock.now();
    const { id, alerted } = await underLabelsLock(this.prisma, async (tx) => {
      const posting = await tx.posting.findUnique({
        where: { id: postingId },
        include: { tier: true },
      });
      if (!posting) throw new NotFoundException("Posting not found");
      if (!posting.tier)
        throw new ConflictException("The Posting has no Tier to correct.");
      if (posting.tier.tier === body.tier)
        throw new ConflictException("That is already the Posting's Tier.");
      const row = await tx.feedCorrection.create({
        data: {
          postingId,
          tier: body.tier,
          jevTier: posting.tier.tier,
          createdAt: now,
        },
      });
      let alerted = false;
      if (posting.tier.tier === "C" && body.tier === "A") {
        const since = { gt: new Date(now.getTime() - WINDOW_MS) };
        const drift = await tx.feedCorrection.count({
          where: { jevTier: "C", tier: "A", createdAt: since },
        });
        const already = await tx.feedCorrection.count({
          where: { alertedAt: since },
        });
        if (drift >= ALERT_AFTER && !already) {
          await tx.feedCorrection.update({
            where: { id: row.id },
            data: { alertedAt: now },
          });
          alerted = true;
        }
      }
      return { id: row.id, alerted };
    });
    // After the commit, so a failing channel never loses the correction; the window is already marked.
    if (alerted)
      await this.alerts
        .alert({
          kind: "tier_drift",
          adapter: "feed-correction",
          message: `${ALERT_AFTER} Feed corrections from C to A in 7 days; a tuning run is due.`,
        })
        .catch((e: Error) =>
          this.logger.error(`alert hook failed: ${e.message}`),
        );
    return { id };
  }
}

import { titlePasses } from "../jev/title-filter";
import { PrismaService } from "../prisma/prisma.service";
import { capsApplied, computeTier, computeTotal } from "./compute-tier";
import { TierConfig } from "./tier-config";

export interface RecomputeCounts {
  found: number;
  processed: number;
  // Includes the filtered Postings.
  skipped: number;
  // Postings the Title filter keeps out of the feed.
  filtered: number;
  failed: number;
}

// The newest row per Posting is the live judgement. A Posting the Title filter now catches has none, even when it was judged before.
async function latestJudgements(prisma: PrismaService) {
  const rows = await prisma.jevJudgement.findMany({
    distinct: ["postingId"],
    orderBy: [{ postingId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    include: { posting: { select: { title: true } } },
  });
  return rows.filter((r) => titlePasses(r.posting.title));
}

// Reads stored judgements only; it has no Jev client, so a weight change never costs a call.
export async function recomputeTiers(
  prisma: PrismaService,
  config: TierConfig,
  configVersion: string,
  log: (line: string) => void = () => {},
): Promise<RecomputeCounts> {
  const postings = await prisma.posting.findMany({
    select: { id: true, title: true },
  });
  const filteredIds = postings
    .filter((p) => !titlePasses(p.title))
    .map((p) => p.id);
  const judgements = await latestJudgements(prisma);
  const counts: RecomputeCounts = {
    found: postings.length,
    processed: 0,
    skipped: postings.length - judgements.length,
    filtered: filteredIds.length,
    failed: 0,
  };
  // The judgements, Labels and Feed corrections stay; only the Tier goes.
  await prisma.postingTier.deleteMany({
    where: { postingId: { in: filteredIds } },
  });
  for (const j of judgements) {
    try {
      const r = computeTier(j.answers, config);
      const data = {
        judgementId: j.id,
        configVersion,
        tier: r.tier,
        total: r.total,
        capsApplied: r.capsApplied,
        computedAt: new Date(),
      };
      await prisma.postingTier.upsert({
        where: { postingId: j.postingId },
        create: { postingId: j.postingId, ...data },
        update: data,
      });
      counts.processed++;
    } catch (e) {
      counts.failed++;
      log(`Posting ${j.postingId}: ${(e as Error).message}`);
    }
  }
  return counts;
}

// Totals of Postings with no cap, because a capped Posting never reaches A or B however it scores.
export async function uncappedTotals(
  prisma: PrismaService,
  config: TierConfig,
): Promise<number[]> {
  const totals: number[] = [];
  for (const j of await latestJudgements(prisma)) {
    try {
      if (capsApplied(j.answers, config).length === 0)
        totals.push(computeTotal(j.answers, config));
    } catch {
      // An invalid row fails the recompute and is counted there.
    }
  }
  return totals;
}

// The top 10% of totals are A and the next 30% are B; a total equal to a threshold takes the higher Tier.
export function thresholdsByRank(totals: number[]): { a: number; b: number } {
  if (totals.length === 0)
    throw new Error("no judgements to set thresholds from");
  const sorted = [...totals].sort((x, y) => y - x);
  const at = (share: number) => sorted[Math.ceil(sorted.length * share) - 1];
  const a = at(0.1);
  const b = at(0.4);
  if (a <= b)
    throw new Error(
      `${totals.length} judgements are too few or too alike to separate A from B`,
    );
  return { a, b };
}

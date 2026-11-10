import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// A Lookalike between the two Postings has nothing left to link, and the rest re-point to the survivor without a second row per pair.
async function moveLookalikes(tx: Tx, fromId: number, intoId: number) {
  const links = await tx.lookalike.findMany({
    where: { OR: [{ lowPostingId: fromId }, { highPostingId: fromId }] },
  });
  for (const link of links) {
    const otherId =
      link.lowPostingId === fromId ? link.highPostingId : link.lowPostingId;
    if (otherId === intoId) continue;
    const [low, high] =
      otherId < intoId ? [otherId, intoId] : [intoId, otherId];
    await tx.lookalike.upsert({
      where: {
        lowPostingId_highPostingId: { lowPostingId: low, highPostingId: high },
      },
      create: {
        lowPostingId: low,
        highPostingId: high,
        reason: link.reason,
        evidence: link.evidence as Prisma.InputJsonValue,
      },
      update: {},
    });
  }
}

export async function absorbPosting(tx: Tx, fromId: number, intoId: number) {
  // Same lock as the tailoring writes, taken before any row moves, so the two can't deadlock.
  await tx.$queryRaw`SELECT id FROM posting WHERE id IN (${fromId}, ${intoId}) ORDER BY id FOR UPDATE`;
  await tx.sighting.updateMany({
    where: { postingId: fromId },
    data: { postingId: intoId },
  });
  await tx.mergeLogEntry.updateMany({
    where: { postingId: fromId },
    data: { postingId: intoId },
  });
  await tx.tailoredResume.updateMany({
    where: { postingId: fromId },
    data: { postingId: intoId },
  });
  await tx.jevJudgement.updateMany({
    where: { postingId: fromId },
    data: { postingId: intoId },
  });
  await moveLookalikes(tx, fromId, intoId);
  // A Posting has at most one open draft and one approved resume, so the newest of each wins.
  const newestFirst = {
    draft: [{ createdAt: "desc" }, { id: "desc" }],
    approved: [{ approvedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  } satisfies Record<string, Prisma.TailoredResumeOrderByWithRelationInput[]>;
  for (const [status, orderBy] of Object.entries(newestFirst)) {
    const newest = await tx.tailoredResume.findFirst({
      where: { postingId: intoId, status },
      orderBy,
    });
    if (newest)
      await tx.tailoredResume.updateMany({
        where: { postingId: intoId, status, id: { not: newest.id } },
        data: { status: "superseded" },
      });
  }
  await tx.posting.delete({ where: { id: fromId } });
}

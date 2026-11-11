import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const ordered = (a: number, b: number) => (a < b ? [a, b] : [b, a]);

export async function recordNotSame(
  tx: Tx,
  a: number,
  b: number,
  reason: "split" | "dismissed",
) {
  const [low, high] = ordered(a, b);
  await tx.notSamePair.upsert({
    where: {
      lowPostingId_highPostingId: { lowPostingId: low, highPostingId: high },
    },
    create: { lowPostingId: low, highPostingId: high, reason },
    update: {},
  });
}

// Every Posting the user said is a different opening from this one.
export async function notSameAs(tx: Tx, postingId: number): Promise<number[]> {
  const pairs = await tx.notSamePair.findMany({
    where: { OR: [{ lowPostingId: postingId }, { highPostingId: postingId }] },
  });
  return pairs.map((p) =>
    p.lowPostingId === postingId ? p.highPostingId : p.lowPostingId,
  );
}

export async function isNotSameAsAny(
  tx: Tx,
  postingId: number,
  others: number[],
): Promise<boolean> {
  if (others.length === 0) return false;
  return (await notSameAs(tx, postingId)).some((id) => others.includes(id));
}

// The absorbed Posting's "not the same" pairs follow the survivor, so an absorb can't undo a split or a dismissal.
export async function moveNotSame(tx: Tx, fromId: number, intoId: number) {
  const pairs = await tx.notSamePair.findMany({
    where: { OR: [{ lowPostingId: fromId }, { highPostingId: fromId }] },
  });
  for (const pair of pairs) {
    const otherId =
      pair.lowPostingId === fromId ? pair.highPostingId : pair.lowPostingId;
    if (otherId !== intoId)
      await recordNotSame(tx, otherId, intoId, pair.reason as "split");
  }
}

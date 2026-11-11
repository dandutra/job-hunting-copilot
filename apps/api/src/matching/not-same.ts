import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type NotSameReason = "split" | "dismissed";

const ordered = (a: number, b: number) => (a < b ? [a, b] : [b, a]);

export async function recordNotSame(
  tx: Tx,
  a: number,
  b: number,
  reason: NotSameReason,
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

async function pairsOf(tx: Tx, postingId: number) {
  const pairs = await tx.notSamePair.findMany({
    where: { OR: [{ lowPostingId: postingId }, { highPostingId: postingId }] },
  });
  return pairs.map((p) => ({
    otherId: p.lowPostingId === postingId ? p.highPostingId : p.lowPostingId,
    reason: p.reason as NotSameReason,
  }));
}

// Every Posting the user said is a different opening from this one.
export async function notSameAs(tx: Tx, postingId: number): Promise<number[]> {
  return (await pairsOf(tx, postingId)).map((p) => p.otherId);
}

export async function isNotSameAsAny(
  tx: Tx,
  postingId: number,
  others: number[],
): Promise<boolean> {
  if (others.length === 0) return false;
  return (await notSameAs(tx, postingId)).some((id) => others.includes(id));
}

// The absorbed Posting's pairs follow the survivor, so an absorb can't undo a split or a dismissal.
export async function moveNotSame(tx: Tx, fromId: number, intoId: number) {
  for (const { otherId, reason } of await pairsOf(tx, fromId)) {
    if (otherId !== intoId) await recordNotSame(tx, otherId, intoId, reason);
  }
  // Moving Lookalikes and pairs onto one survivor can put a Lookalike on a pair the user already judged.
  const apart = await notSameAs(tx, intoId);
  await tx.lookalike.deleteMany({
    where: {
      OR: [
        { lowPostingId: intoId, highPostingId: { in: apart } },
        { highPostingId: intoId, lowPostingId: { in: apart } },
      ],
    },
  });
}

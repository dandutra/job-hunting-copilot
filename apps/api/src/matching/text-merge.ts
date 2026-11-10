import { Prisma, Sighting } from "@prisma/client";
import { conflicts, keysOf } from "./key-conflicts";
import {
  judgePair,
  LookalikeReason,
  PairVerdict,
  textAgreement,
} from "./pair-verdict";
import { absorbPosting } from "./posting-absorb";
import { atsSources } from "./sighting-draft";

type Tx = Prisma.TransactionClient;

type Linkable = Extract<PairVerdict, { kind: "merge" | "lookalike" }>;

interface Candidate {
  postingId: number;
  other: Sighting;
  verdict: Linkable;
}

export interface TextRuleResult {
  homeId: number;
}

export interface TextRuleInput {
  sighting: Sighting;
  homeId: number;
  // Companies whose name is close to this Sighting's but is not an alias of it.
  similarCompanyIds: number[];
  cutoff: Date;
}

async function recordLookalike(
  tx: Tx,
  a: number,
  b: number,
  reason: LookalikeReason,
  evidence: Prisma.InputJsonObject,
) {
  const [low, high] = a < b ? [a, b] : [b, a];
  await tx.lookalike.upsert({
    where: {
      lowPostingId_highPostingId: { lowPostingId: low, highPostingId: high },
    },
    create: { lowPostingId: low, highPostingId: high, reason, evidence },
    update: {},
  });
}

// Merge outranks Lookalike when one Posting has several Sightings that match.
function better(a: Linkable, b: Linkable | undefined): boolean {
  if (!b) return true;
  return a.kind === "merge" && b.kind !== "merge";
}

async function candidatesFor(tx: Tx, input: TextRuleInput) {
  const { sighting, homeId, similarCompanyIds, cutoff } = input;
  const others = await tx.sighting.findMany({
    where: {
      lastSeenAt: { gte: cutoff },
      postingId: { not: homeId },
      companyId: { in: [sighting.companyId, ...similarCompanyIds] },
    },
    orderBy: { id: "asc" },
  });
  const best = new Map<number, Candidate>();
  // One clearly different Sighting keeps its whole Posting apart, whatever its other Sightings say.
  const vetoed = new Set<number>();
  for (const other of others) {
    const relation =
      other.companyId === sighting.companyId ? "same" : "similar";
    const verdict = judgePair(sighting, other, relation);
    if (verdict.kind === "veto") vetoed.add(other.postingId);
    if (verdict.kind === "none" || verdict.kind === "veto") continue;
    if (better(verdict, best.get(other.postingId)?.verdict))
      best.set(other.postingId, { postingId: other.postingId, other, verdict });
  }
  for (const postingId of vetoed) best.delete(postingId);
  return [...best.values()].sort((a, b) => a.postingId - b.postingId);
}

// Rule 3 and the Lookalike cases, for one Sighting against Postings it does not share a key with.
export async function applyTextRules(
  tx: Tx,
  input: TextRuleInput,
): Promise<TextRuleResult> {
  const { sighting } = input;
  let homeId = input.homeId;
  const candidates = await candidatesFor(tx, input);
  if (candidates.length === 0) return { homeId };

  const onAts = new Set(
    (
      await tx.sighting.findMany({
        where: {
          postingId: {
            in: [homeId, ...candidates.map((c) => c.postingId)],
          },
          jobSource: { in: atsSources() },
        },
        select: { postingId: true },
      })
    ).map((s) => s.postingId),
  );
  // A board Sighting that fits two ATS Postings is the bridge between two requisitions, so it joins neither.
  const atsMerges = candidates.filter(
    (c) => c.verdict.kind === "merge" && onAts.has(c.postingId),
  );
  const ties =
    !atsSources().includes(sighting.jobSource) &&
    atsMerges.length >= 1 &&
    atsMerges.length + (onAts.has(homeId) ? 1 : 0) >= 2;

  const lookalikes: Candidate[] = [];
  for (const candidate of candidates) {
    const { verdict, other, postingId } = candidate;
    const tied = ties && onAts.has(postingId);
    if (verdict.kind !== "merge" || tied) {
      lookalikes.push(
        tied
          ? {
              ...candidate,
              verdict: { ...verdict, kind: "lookalike", reason: "board_tie" },
            }
          : candidate,
      );
      continue;
    }
    const ours = await tx.sighting.findMany({ where: { postingId: homeId } });
    const theirs = await tx.sighting.findMany({ where: { postingId } });
    const agreements = ours.flatMap((a) =>
      theirs.map((b) => textAgreement(a, b)),
    );
    if (agreements.includes("clash")) continue;
    if (
      conflicts(keysOf(ours), keysOf(theirs)) ||
      agreements.includes("doubt")
    ) {
      lookalikes.push({
        ...candidate,
        verdict: {
          kind: "lookalike",
          reason: "same_title",
          similarity: verdict.similarity,
        },
      });
      continue;
    }
    const survivor = Math.min(homeId, postingId);
    await absorbPosting(tx, Math.max(homeId, postingId), survivor);
    await tx.mergeLogEntry.create({
      data: {
        rule: "text_similarity",
        evidence: {
          method: verdict.method,
          similarity: verdict.similarity,
          sightingId: sighting.id,
          matchedSightingId: other.id,
          draftJobSource: sighting.jobSource,
          matchedJobSource: other.jobSource,
          title: sighting.title,
        },
        postingId: survivor,
        absorbedPostingId: Math.max(homeId, postingId),
      },
    });
    homeId = survivor;
  }

  for (const { verdict, other, postingId } of lookalikes) {
    if (verdict.kind !== "lookalike") continue;
    await recordLookalike(tx, homeId, postingId, verdict.reason, {
      similarity: verdict.similarity,
      sightingId: sighting.id,
      matchedSightingId: other.id,
    });
  }
  return { homeId };
}

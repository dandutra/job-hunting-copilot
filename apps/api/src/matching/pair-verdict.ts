import { sameMetro } from "./metro";
import { shingleSimilarity, snippetInside } from "./text-similarity";
import { normalizeTitle, titleSimilarity } from "./title";

// Rule 3's bar. Tuning may move the veto, never this.
export const MERGE_AT_LEAST = 0.9;
// Below this, two full descriptions clearly differ. No real data has tuned it yet.
export const VETO_BELOW = 0.5;
const LOOKALIKE_TITLE_AT_LEAST = 0.8;

export interface SightingFacts {
  jobSource: string;
  title: string;
  location: string;
  description: string;
  descriptionKind: string;
}

export type CompanyRelation = "same" | "similar" | "other";

export type LookalikeReason =
  "similar_title" | "similar_company" | "board_tie" | "same_title";

export type PairVerdict =
  | {
      kind: "merge";
      method: "shingles" | "snippet";
      similarity: number | null;
    }
  | { kind: "veto"; similarity: number }
  | { kind: "lookalike"; reason: LookalikeReason; similarity: number | null }
  | { kind: "none" };

type TextEvidence =
  | { kind: "merge"; method: "shingles" | "snippet"; similarity: number | null }
  | { kind: "veto"; similarity: number }
  | { kind: "none"; similarity: number | null };

function textEvidence(a: SightingFacts, b: SightingFacts): TextEvidence {
  if (a.descriptionKind === "full" && b.descriptionKind === "full") {
    const similarity = shingleSimilarity(a.description, b.description);
    if (similarity === null) return { kind: "none", similarity };
    if (similarity >= MERGE_AT_LEAST)
      return { kind: "merge", method: "shingles", similarity };
    if (similarity < VETO_BELOW) return { kind: "veto", similarity };
    return { kind: "none", similarity };
  }
  const [snippet, full] = a.descriptionKind === "snippet" ? [a, b] : [b, a];
  const pairsSnippetWithFull =
    snippet.descriptionKind === "snippet" && full.descriptionKind === "full";
  // Only Adzuna's snippet is a verbatim cut of the listing; an alert's may be reworded.
  if (
    pairsSnippetWithFull &&
    snippet.jobSource === "adzuna" &&
    snippetInside(snippet.description, full.description)
  )
    return { kind: "merge", method: "snippet", similarity: null };
  return { kind: "none", similarity: null };
}

// Rule 3 and the five Lookalike cases for two Sightings that sit on different Postings.
export function judgePair(
  a: SightingFacts,
  b: SightingFacts,
  company: CompanyRelation,
): PairVerdict {
  if (company === "other" || !sameMetro(a.location, b.location))
    return { kind: "none" };
  const text = textEvidence(a, b);
  if (text.kind === "veto") return text;

  const left = normalizeTitle(a.title);
  const equalTitle = left !== "" && left === normalizeTitle(b.title);
  if (equalTitle && company === "same") {
    if (text.kind === "merge") return text;
    return {
      kind: "lookalike",
      reason: "same_title",
      similarity: text.similarity,
    };
  }
  if (equalTitle && company === "similar")
    return { kind: "lookalike", reason: "similar_company", similarity: null };
  if (company === "same") {
    const close = titleSimilarity(a.title, b.title);
    if (close >= LOOKALIKE_TITLE_AT_LEAST && close < 1)
      return { kind: "lookalike", reason: "similar_title", similarity: null };
  }
  return { kind: "none" };
}

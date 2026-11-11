import type { components } from "../api/schema";

export type FeedItem = components["schemas"]["FeedItemDto"];
export type PostingDetail = components["schemas"]["PostingDetailDto"];
export type TierLetter = FeedItem["tier"];
export const TIERS: TierLetter[] = ["A", "B", "C"];

const DAY_MS = 24 * 60 * 60 * 1000;

export function age(postedAt: string, now: number = Date.now()): string {
  const days = Math.floor((now - Date.parse(postedAt)) / DAY_MS);
  return days < 1 ? "today" : `${days}d`;
}

const CAP_LABELS: Record<string, string> = {
  closed_to_juniors: "Closed to juniors",
  outside_gta: "Work outside the GTA",
  us_only: "US only",
  security_clearance: "Security clearance required",
  requires_french: "French required",
};

export const capReason = (caps: string[]) =>
  caps.map((c) => CAP_LABELS[c] ?? c).join("; ");

const WORDS: Record<string, string> = {
  full_stack: "full-stack",
  back_end: "back-end",
  front_end: "front-end",
  cloud_ops: "cloud/ops",
  on_site: "on-site",
  not_stated: "not stated",
};
export const word = (v: string) => WORDS[v] ?? v;

const FACTOR_LABELS: Record<string, string> = {
  skills_covered: "Skills covered",
  level_match: "Level match",
  role_family: "Role family",
  work_arrangement: "Work arrangement",
};
export const factorLabel = (f: string) => FACTOR_LABELS[f] ?? f;

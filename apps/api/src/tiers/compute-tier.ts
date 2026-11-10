import {
  CAP_NAMES,
  CapName,
  invalidAnswers,
  SCORE_LEVELS,
} from "../jev/question-set";
import { TierConfig } from "./tier-config";

export type Tier = "A" | "B" | "C";

export interface TierResult {
  tier: Tier;
  total: number;
  capsApplied: CapName[];
}

type Obj = Record<string, Record<string, unknown>>;

const unit = (name: keyof typeof SCORE_LEVELS, score: number) =>
  score / (SCORE_LEVELS[name].length - 1);

// The total before caps. A Posting held at C still has its total, so tuning can see how strong it was.
export function computeTotal(answers: unknown, config: TierConfig): number {
  const problem = invalidAnswers(answers);
  if (problem) throw new Error(problem);
  const a = answers as Obj;
  const skills = unit("skills_covered", a.skills_covered.score as number);
  const level = unit("level_match", a.level_match.score as number);
  const combined =
    config.scoreWeight * skills + (1 - config.scoreWeight) * level;
  const role =
    config.rolePoints[a.role_family.choice as keyof TierConfig["rolePoints"]];
  const work =
    a.work_arrangement.choice === "not_stated"
      ? 0
      : config.workPoints[
          a.work_arrangement.choice as keyof TierConfig["workPoints"]
        ];
  return combined + role + work;
}

export function capsApplied(answers: unknown, config: TierConfig): CapName[] {
  const a = answers as Obj;
  return CAP_NAMES.filter(
    (name) => (a[name].noul as number) >= config.capThresholds[name],
  );
}

export function computeTier(answers: unknown, config: TierConfig): TierResult {
  const total = computeTotal(answers, config);
  const caps = capsApplied(answers, config);
  const tier: Tier =
    caps.length > 0
      ? "C"
      : total >= config.thresholds.a
        ? "A"
        : total >= config.thresholds.b
          ? "B"
          : "C";
  return { tier, total, capsApplied: caps };
}

// Thin is not stored: it follows the Posting's description kind.
export const isThin = (posting: { descriptionKind: string }) =>
  posting.descriptionKind !== "full";

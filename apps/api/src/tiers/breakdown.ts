import { invalidAnswers, SCORE_LEVELS } from "../jev/question-set";
import { TierConfig } from "./tier-config";

export interface Factor {
  factor: "skills_covered" | "level_match" | "role_family" | "work_arrangement";
  answer: string;
  points: number;
}

export interface Breakdown {
  total: number;
  roleFamily: string;
  workArrangement: string;
  factors: Factor[];
}

type Obj = Record<string, Record<string, unknown>>;

const unit = (name: keyof typeof SCORE_LEVELS, score: number) =>
  score / (SCORE_LEVELS[name].length - 1);

// The same arithmetic as computeTotal, split by factor so the screen can show where the points came from.
export function tierBreakdown(
  answers: unknown,
  config: TierConfig,
): Breakdown | null {
  if (invalidAnswers(answers)) return null;
  const a = answers as Obj;
  const skills = a.skills_covered.score as number;
  const level = a.level_match.score as number;
  const role = a.role_family.choice as keyof TierConfig["rolePoints"];
  const work = a.work_arrangement.choice as string;
  const factors: Factor[] = [
    {
      factor: "skills_covered",
      answer: `${skills} of ${SCORE_LEVELS.skills_covered.length - 1}`,
      points: config.scoreWeight * unit("skills_covered", skills),
    },
    {
      factor: "level_match",
      answer: `${level} of ${SCORE_LEVELS.level_match.length - 1}`,
      points: (1 - config.scoreWeight) * unit("level_match", level),
    },
    { factor: "role_family", answer: role, points: config.rolePoints[role] },
    {
      factor: "work_arrangement",
      answer: work,
      points:
        work === "not_stated"
          ? 0
          : config.workPoints[work as keyof TierConfig["workPoints"]],
    },
  ];
  return {
    total: factors.reduce((s, f) => s + f.points, 0),
    roleFamily: role,
    workArrangement: work,
    factors,
  };
}

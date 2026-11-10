import type { Posting } from "@prisma/client";

// Bump when any question or level is reworded; stored with every judgement.
export const QUESTION_SET_VERSION = "1";

export const ROLE_FAMILIES = [
  "full_stack",
  "back_end",
  "front_end",
  "cloud_ops",
  "support",
  "other",
] as const;
export const WORK_ARRANGEMENTS = [
  "hybrid",
  "remote",
  "on_site",
  "not_stated",
] as const;

// One Noul per Tier cap; each asks whether the text states the cap, so a short text can't trigger it.
export const CAP_QUESTIONS = {
  closed_to_juniors:
    "Does `posting` say it is closed to juniors or new graduates, for example by requiring several years of experience or a senior level?",
  outside_gta:
    "Does `posting` say the work must be done at a place outside the Greater Toronto Area, with no remote option inside Canada?",
  us_only:
    "Does `posting` say it is open only to people in the United States or authorized to work in the United States?",
  security_clearance:
    "Does `posting` say it requires a government security clearance?",
  requires_french: "Does `posting` say it requires French?",
} as const;

export const SCORE_LEVELS = {
  skills_covered: [
    "Almost none of the skills `posting` asks for appear in `master_profile`",
    "Some skills appear, with clear gaps in the core of what `posting` asks for",
    "Most of the skills appear, with minor gaps",
    "`master_profile` covers the skills `posting` asks for, including the core ones",
  ],
  level_match: [
    "`posting` asks for a level far above what `master_profile` shows",
    "`posting` asks for somewhat more experience than `master_profile` shows",
    "`posting` asks for about the level `master_profile` shows",
    "`posting` is open to the level `master_profile` shows, or states no level",
  ],
} as const;

export const SCORE_NAMES = Object.keys(SCORE_LEVELS) as ScoreName[];
export const CAP_NAMES = Object.keys(CAP_QUESTIONS) as CapName[];
export type ScoreName = keyof typeof SCORE_LEVELS;
export type CapName = keyof typeof CAP_QUESTIONS;

export function questions() {
  return {
    skills_covered: {
      type: "score",
      instructions:
        "How well do the skills in `master_profile` cover the skills `posting` asks for?",
      criteria: SCORE_LEVELS.skills_covered,
    },
    level_match: {
      type: "score",
      instructions:
        "How does the experience level `posting` asks for compare with `master_profile`?",
      criteria: SCORE_LEVELS.level_match,
    },
    role_family: {
      type: "choice",
      instructions: "What kind of role is `posting` for?",
      criteria: {
        full_stack: "Works across the front end and the back end",
        back_end: "Server-side services, APIs and data",
        front_end: "Browser or mobile user interfaces",
        cloud_ops: "Infrastructure, deployment, reliability or DevOps",
        support: "Technical or application support",
        other: "None of the above",
      },
    },
    work_arrangement: {
      type: "choice",
      instructions: "Where does `posting` say the work happens?",
      criteria: {
        hybrid: "Part on-site and part remote",
        remote: "Fully remote",
        on_site: "Fully on-site",
        not_stated: "`posting` does not say",
      },
    },
    ...Object.fromEntries(
      Object.entries(CAP_QUESTIONS).map(([name, instructions]) => [
        name,
        { type: "noul", instructions },
      ]),
    ),
  } as const;
}

// Only the fit summary of the profile goes to Jev; see the Master profile schema gotcha.
export function judgementState(
  posting: Pick<Posting, "title" | "location" | "description">,
  fitSummary: string,
) {
  return {
    posting: {
      title: posting.title,
      location: posting.location,
      description: posting.description,
    },
    master_profile: fitSummary,
  };
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface JevResponse {
  model: string;
  answers: Record<string, unknown>;
  usage: Usage;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNumberIn(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

// Returns the first problem found, or null. Never echoes a value, since answers can quote the Posting.
export function invalidAnswers(answers: unknown): string | null {
  if (!isObject(answers)) return "answers is not an object";
  for (const name of SCORE_NAMES) {
    const a = answers[name];
    if (!isObject(a) || !isNumberIn(a.score, 0, SCORE_LEVELS[name].length - 1))
      return `${name} is not a Score in range`;
  }
  const choices = {
    role_family: ROLE_FAMILIES,
    work_arrangement: WORK_ARRANGEMENTS,
  } as const;
  for (const [name, labels] of Object.entries(choices)) {
    const a = answers[name];
    if (
      !isObject(a) ||
      typeof a.choice !== "string" ||
      !(labels as readonly string[]).includes(a.choice)
    )
      return `${name} is not one of its labels`;
  }
  for (const name of CAP_NAMES) {
    const a = answers[name];
    if (!isObject(a) || !isNumberIn(a.noul, 0, 1))
      return `${name} is not a probability`;
  }
  return null;
}

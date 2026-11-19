import type { components } from "../api/schema";

export type Resume = components["schemas"]["TailoredResumeDto"];
export type Drafts = components["schemas"]["PostingDraftsDto"];
export type LineView = components["schemas"]["LineViewDto"];
export type Verdict = components["schemas"]["VerdictDto"];

// Every line the user can select, in the order the document shows them.
export function allLines(r: Resume): LineView[] {
  return [
    ...r.summary,
    ...r.experiences.flatMap((e) => e.bullets),
    ...r.projects.flatMap((p) => p.bullets),
    ...(r.coverLetter?.paragraphs ?? []),
  ];
}

export const verdictOf = (r: Resume, line: string): Verdict | undefined =>
  r.verdicts?.find((v) => v.line === line);

export const isFlagged = (v: Verdict | undefined) =>
  v !== undefined && v.status !== "pass";

// A partial review leaves some lines without a verdict, so "read" counts verdicts, not lines.
export function counts(r: Resume) {
  const verdicts = r.verdicts ?? [];
  const passed = verdicts.filter((v) => v.status === "pass").length;
  return { read: verdicts.length, passed, flagged: verdicts.length - passed };
}

import { z } from "zod";
import type { Profile } from "./schema";

const LineSchema = z.strictObject({
  text: z.string(),
  cites: z.array(z.string()),
});
const DraftSectionSchema = z.strictObject({
  id: z.string(),
  bullets: z.array(LineSchema),
});
const SkillLineSchema = z.strictObject({
  skillId: z.string(),
  text: z.string(),
});

export const TailoredDraftSchema = z.strictObject({
  experiences: z.array(DraftSectionSchema),
  projects: z.array(DraftSectionSchema),
  educationIds: z.array(z.string()),
  // One line per Highlight, so each one carries its own cites and verdict.
  summary: z.array(LineSchema).min(1),
  skills: z.array(SkillLineSchema),
  coverLetter: z.array(LineSchema).optional(),
  postingText: z.string().optional(),
});

export type Line = z.infer<typeof LineSchema>;
export type DraftSection = z.infer<typeof DraftSectionSchema>;
export type SkillLine = z.infer<typeof SkillLineSchema>;
export type TailoredDraft = z.infer<typeof TailoredDraftSchema>;

// "shape" is a draft that isn't a TailoredDraft at all; 1 to 5 are #57's rules.
export type TraceRule = "shape" | 1 | 2 | 3 | 4 | 5;
export type TraceFailure = {
  rule: TraceRule;
  location: string;
  detail: string;
};
export type TraceResult =
  { ok: true } | { ok: false; failures: TraceFailure[] };

type Entry =
  { kind: "fact"; fact: Profile["facts"][number] } | { kind: "other" };

function indexEntries(profile: Profile) {
  const live = new Map<string, Entry>();
  const known = new Set<string>();
  const add = (id: string, retired: boolean, entry: Entry) => {
    known.add(id);
    if (!retired) live.set(id, entry);
  };
  for (const e of profile.experiences) add(e.id, e.retired, { kind: "other" });
  for (const p of profile.projects) add(p.id, p.retired, { kind: "other" });
  for (const d of profile.education) add(d.id, d.retired, { kind: "other" });
  for (const s of profile.skills) add(s.id, s.retired, { kind: "other" });
  for (const f of profile.facts)
    add(f.id, f.retired, { kind: "fact", fact: f });
  return { live, known };
}

// Pure on purpose: failures carry IDs and locations, never draft text, so callers can log them.
export function traceCheck(profile: Profile, input: unknown): TraceResult {
  const parsed = TailoredDraftSchema.safeParse(input);
  if (!parsed.success) {
    // The issue code only, because zod messages can quote the bad value.
    const failures = parsed.error.issues.map((issue) => ({
      rule: "shape" as const,
      location: issue.path.map(String).join(".") || "draft",
      detail: issue.code,
    }));
    return { ok: false, failures };
  }
  const draft = parsed.data;
  const { live, known } = indexEntries(profile);
  const failures: TraceFailure[] = [];
  const parentOf = new Map(profile.facts.map((f) => [f.id, f.parent]));
  // `related` holds Fact IDs, so a link to an Entry means a related Fact under that Entry.
  const relatesTo = (fact: Profile["facts"][number], ownerId: string) =>
    fact.related.some((id) => id === ownerId || parentOf.get(id) === ownerId);
  const fail = (rule: TraceRule, location: string, detail: string) =>
    failures.push({ rule, location, detail });
  // An unknown ID is draft text and may be prose, so only a known ID is echoed.
  const missing = (id: string) =>
    known.has(id) ? `${id} is retired` : "an unknown ID";

  const checkLine = (
    line: Line,
    location: string,
    surface: "resume" | "cover-letter",
    ownerId?: string,
  ) => {
    if (line.cites.length === 0) fail(1, location, "cites no Entry");
    for (const id of line.cites) {
      const entry = live.get(id);
      if (!entry) {
        fail(1, location, missing(id));
        continue;
      }
      if (entry.kind !== "fact") {
        if (ownerId) fail(3, location, `${id} is not a Fact`);
        continue;
      }
      const { fact } = entry;
      if (!fact.use.includes(surface)) {
        fail(2, location, `${id} is not allowed on ${surface}`);
      }
      if (ownerId && fact.parent !== ownerId && !relatesTo(fact, ownerId)) {
        fail(3, location, `${id} belongs to ${fact.parent}, not ${ownerId}`);
      }
    }
  };

  const checkSections = (
    sections: DraftSection[],
    key: "experiences" | "projects",
  ) => {
    sections.forEach((section, i) => {
      const where = `${key}[${i}]`;
      if (!live.has(section.id)) {
        fail(1, where, missing(section.id));
      }
      // Rule 1 already fails an unknown section, and its ID must not reach a rule 3 detail.
      const ownerId = known.has(section.id) ? section.id : undefined;
      section.bullets.forEach((bullet, j) =>
        checkLine(bullet, `${where}.bullets[${j}]`, "resume", ownerId),
      );
    });
  };

  draft.summary.forEach((line, i) =>
    checkLine(line, `summary[${i}]`, "resume"),
  );
  checkSections(draft.experiences, "experiences");
  checkSections(draft.projects, "projects");

  draft.educationIds.forEach((id, i) => {
    if (!live.has(id)) {
      fail(1, `educationIds[${i}]`, missing(id));
    }
  });

  const skillsById = new Map(profile.skills.map((s) => [s.id, s]));
  draft.skills.forEach((line, i) => {
    const where = `skills[${i}]`;
    const skill = skillsById.get(line.skillId);
    if (!skill || skill.retired) {
      fail(1, where, skill ? `${skill.id} is retired` : "an unknown ID");
      return;
    }
    if (line.text !== skill.name && !skill.aliases.includes(line.text)) {
      fail(4, where, `text is not the name or an alias of ${skill.id}`);
    }
  });

  draft.coverLetter?.forEach((paragraph, i) =>
    checkLine(paragraph, `coverLetter[${i}]`, "cover-letter"),
  );

  // A fixed Experience is filled by the API, so the draft lists it and writes nothing under it.
  for (const exp of profile.experiences) {
    if (!exp.fixed || exp.retired) continue;
    let listed = false;
    draft.experiences.forEach((section, i) => {
      if (section.id !== exp.id) return;
      listed = true;
      if (section.bullets.length > 0) {
        fail(5, `experiences[${i}]`, `${exp.id} is fixed and was reworded`);
      }
    });
    if (!listed) fail(5, "experiences", `${exp.id} is fixed and was dropped`);
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

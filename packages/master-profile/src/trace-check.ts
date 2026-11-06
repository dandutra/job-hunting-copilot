import type { Profile } from "./schema";

export type Line = { text: string; cites: string[] };
export type DraftSection = { id: string; bullets: Line[] };
export type SkillLine = { skillId: string; text: string };

export type TailoredDraft = {
  experiences: DraftSection[];
  projects: DraftSection[];
  educationIds: string[];
  summary: Line;
  skills: SkillLine[];
  coverLetter?: Line[];
  postingText?: string;
};

export type TraceRule = 1 | 2 | 3 | 4 | 5;
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
export function traceCheck(
  profile: Profile,
  draft: TailoredDraft,
): TraceResult {
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
      section.bullets.forEach((bullet, j) =>
        checkLine(bullet, `${where}.bullets[${j}]`, "resume", section.id),
      );
    });
  };

  checkLine(draft.summary, "summary", "resume");
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

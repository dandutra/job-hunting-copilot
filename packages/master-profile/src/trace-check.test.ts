import { describe, expect, it } from "vitest";
import { validRaw, yamlOf, type Raw } from "./fixtures";
import { traceCheck, type TailoredDraft } from "./trace-check";
import { validateProfile } from "./validate";

function profileWith(mutate: (raw: Raw) => void = () => {}) {
  const raw = validRaw();
  mutate(raw);
  const result = validateProfile(yamlOf(raw));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.profile;
}

const fact = (id: string, parent: string, extra: object = {}) => ({
  id,
  parent,
  text: `Did ${id}.`,
  tags: ["back-end"],
  ownership: "solo",
  sources: ["user"],
  ...extra,
});

function draftWith(
  mutate: (d: TailoredDraft) => void = () => {},
): TailoredDraft {
  const d: TailoredDraft = {
    experiences: [
      { id: "E1", bullets: [{ text: "Built reports.", cites: ["F1"] }] },
    ],
    projects: [],
    educationIds: ["D1"],
    summary: { text: "A developer.", cites: ["F1"] },
    skills: [{ skillId: "S1", text: "TypeScript" }],
    coverLetter: [{ text: "I built reports.", cites: ["F1"] }],
  };
  mutate(d);
  return d;
}

function rulesOf(
  profile: ReturnType<typeof profileWith>,
  draft: TailoredDraft,
) {
  const r = traceCheck(profile, draft);
  return r.ok ? [] : r.failures.map((f) => f.rule);
}

describe("traceCheck", () => {
  it("passes a clean draft", () => {
    expect(traceCheck(profileWith(), draftWith())).toEqual({ ok: true });
  });

  it("rule 1: no citation, unknown and retired Entries", () => {
    const profile = profileWith((raw) => {
      (raw.facts as object[]).push(fact("F2", "E1", { retired: true }));
    });
    const d = draftWith((d) => {
      d.summary.cites = [];
      d.experiences[0].bullets = [
        { text: "a", cites: ["F99"] },
        { text: "b", cites: ["F2"] },
      ];
    });
    const r = traceCheck(profile, d);
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.failures.map((f) => [f.rule, f.location])).toEqual([
      [1, "summary"],
      [1, "experiences[0].bullets[0]"],
      [1, "experiences[0].bullets[1]"],
    ]);
  });

  it("rule 1: unknown or retired section and skill IDs", () => {
    const profile = profileWith((raw) => {
      (raw.skills as object[]).push({
        id: "S2",
        name: "Go",
        evidence: ["F1"],
        retired: true,
      });
    });
    const d = draftWith((d) => {
      d.experiences.push({ id: "E9", bullets: [] });
      d.educationIds = ["D9"];
      d.skills = [
        { skillId: "S2", text: "Go" },
        { skillId: "S9", text: "x" },
      ];
    });
    expect(rulesOf(profile, d)).toEqual([1, 1, 1, 1]);
  });

  it("rule 2: Fact use lacks the surface", () => {
    const profile = profileWith((raw) => {
      (raw.facts as object[]).push(fact("F2", "E1", { use: ["resume"] }));
    });
    const d = draftWith((d) => {
      d.coverLetter = [{ text: "x", cites: ["F2"] }];
    });
    expect(rulesOf(profile, d)).toEqual([2]);
  });

  it("rule 3: a bullet cites a Fact from another Entry", () => {
    const profile = profileWith((raw) => {
      (raw.projects as object[]).push({ id: "P2", name: "Other" });
      (raw.facts as object[]).push(fact("F2", "P2"));
    });
    const d = draftWith((d) => {
      d.experiences[0].bullets = [{ text: "x", cites: ["F2"] }];
    });
    expect(rulesOf(profile, d)).toEqual([3]);
  });

  it("rule 3 passes when the Fact's related names the Entry", () => {
    const profile = profileWith((raw) => {
      (raw.projects as object[]).push({ id: "P2", name: "Other" });
      (raw.facts as object[]).push(fact("F2", "P2", { related: ["F1"] }));
    });
    const d = draftWith((d) => {
      d.experiences[0].bullets = [{ text: "x", cites: ["F2"] }];
    });
    expect(traceCheck(profile, d)).toEqual({ ok: true });
  });

  it("rule 4: a Skills string must be the name or an alias", () => {
    const profile = profileWith((raw) => {
      (raw.skills as { aliases?: string[] }[])[0].aliases = ["TS"];
    });
    expect(
      rulesOf(
        profile,
        draftWith((d) => (d.skills = [{ skillId: "S1", text: "TS" }])),
      ),
    ).toEqual([]);
    expect(
      rulesOf(
        profile,
        draftWith((d) => (d.skills = [{ skillId: "S1", text: "Typescript" }])),
      ),
    ).toEqual([4]);
  });

  it("rule 5: a fixed Experience is dropped or reworded", () => {
    const profile = profileWith((raw) => {
      (raw.experiences as { fixed?: boolean }[])[0].fixed = true;
    });
    const reworded = draftWith();
    const dropped = draftWith((d) => (d.experiences = []));
    const clean = draftWith(
      (d) => (d.experiences = [{ id: "E1", bullets: [] }]),
    );
    expect(rulesOf(profile, reworded)).toEqual([5]);
    expect(rulesOf(profile, dropped)).toEqual([5]);
    expect(traceCheck(profile, clean)).toEqual({ ok: true });
  });

  it("lists every failure, not the first", () => {
    const profile = profileWith((raw) => {
      (raw.experiences as { fixed?: boolean }[])[0].fixed = true;
    });
    const d = draftWith((d) => {
      d.summary.cites = [];
      d.skills = [{ skillId: "S1", text: "Nope" }];
    });
    expect(rulesOf(profile, d)).toEqual([1, 4, 5]);
  });

  it("never puts draft text in a failure", () => {
    const d = draftWith((d) => {
      d.summary = { text: "SECRET-LINE", cites: [] };
      d.skills = [{ skillId: "S1", text: "SECRET-SKILL" }];
    });
    expect(JSON.stringify(traceCheck(profileWith(), d))).not.toContain(
      "SECRET",
    );
  });
});

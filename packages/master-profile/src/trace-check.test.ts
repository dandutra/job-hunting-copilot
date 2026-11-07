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
    summary: [
      { text: "A developer.", cites: ["F1"] },
      { text: "Ships weekly.", cites: ["F1"] },
    ],
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
      d.summary[1].cites = [];
      d.experiences[0].bullets = [
        { text: "a", cites: ["F99"] },
        { text: "b", cites: ["F2"] },
      ];
    });
    const r = traceCheck(profile, d);
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.failures.map((f) => [f.rule, f.location])).toEqual([
      [1, "summary[1]"],
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

  it("rule 3: a bullet cites an Entry that is not a Fact", () => {
    const profile = profileWith((raw) => {
      (raw.experiences as object[]).push({
        id: "E2",
        employer: "Other Co",
        titles: ["Dev"],
        start: "2019-01",
        location: "Testville",
        type: "employment",
      });
    });
    const d = draftWith((d) => {
      d.experiences[0].bullets = [{ text: "x", cites: ["E2"] }];
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
    const listedTwice = draftWith((d) =>
      d.experiences.push({ id: "E1", bullets: [] }),
    );
    expect(rulesOf(profile, listedTwice)).toEqual([5]);
    expect(traceCheck(profile, clean)).toEqual({ ok: true });
  });

  it("lists every failure, not the first", () => {
    const profile = profileWith((raw) => {
      (raw.experiences as { fixed?: boolean }[])[0].fixed = true;
    });
    const d = draftWith((d) => {
      d.summary[0].cites = [];
      d.skills = [{ skillId: "S1", text: "Nope" }];
    });
    expect(rulesOf(profile, d)).toEqual([1, 4, 5]);
  });

  it("returns shape failures instead of throwing on a malformed draft", () => {
    const profile = profileWith();
    for (const bad of [
      {},
      null,
      "SECRET-STRING",
      { ...draftWith(), summary: { text: "x", cites: ["F1"] } },
      { ...draftWith(), summary: [] },
      { ...draftWith(), experiences: [{ id: "E1" }] },
      { ...draftWith(), "SECRET-KEY": 1 },
      { ...draftWith(), educationIds: [42] },
    ]) {
      const r = traceCheck(profile, bad);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.failures.every((f) => f.rule === "shape")).toBe(true);
      expect(JSON.stringify(r)).not.toContain("SECRET");
    }
  });

  it("never puts draft text in a failure", () => {
    const d = draftWith((d) => {
      d.summary = [{ text: "SECRET-LINE", cites: [] }];
      d.skills = [
        { skillId: "S1", text: "SECRET-SKILL" },
        { skillId: "SECRET-SKILL-ID", text: "x" },
      ];
      d.coverLetter = [{ text: "x", cites: ["SECRET-CITE"] }];
      d.experiences.push({
        id: "SECRET-SECTION",
        bullets: [{ text: "x", cites: ["F1", "E1"] }],
      });
      d.educationIds = ["SECRET-EDUCATION"];
    });
    expect(JSON.stringify(traceCheck(profileWith(), d))).not.toContain(
      "SECRET",
    );
  });
});

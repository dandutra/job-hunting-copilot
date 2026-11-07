import { describe, expect, it } from "vitest";
import { fitSummary } from "./fit-summary";
import { validRaw, yamlOf, type Raw } from "./fixtures";
import { validateProfile } from "./validate";

function profileWith(mutate: (raw: Raw) => void) {
  const raw = validRaw();
  mutate(raw);
  const result = validateProfile(yamlOf(raw));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.profile;
}

const SECRETS = [
  "SECRET-CONTACT-EMAIL@example.com",
  "SECRET-CONTACT-NAME",
  "555-555-0199",
  "SECRET-CITY",
  "SECRET-EMPLOYER",
  "SECRET-SOURCE",
  "SECRET-DONOTCLAIM",
  "SECRET-RETIRED-FACT",
  "SECRET-NO-RESUME-FACT",
  "SECRET-ALIAS",
  "SECRET-RETIRED-SKILL",
  "SECRET-RULE",
  "SECRET-NOTE",
];

describe("fitSummary", () => {
  const profile = profileWith((raw) => {
    raw.sources = ["SECRET-SOURCE"];
    raw.contact = {
      name: "SECRET-CONTACT-NAME",
      city: "SECRET-CITY",
      email: "SECRET-CONTACT-EMAIL@example.com",
      phone: "555-555-0199",
      links: [],
    };
    raw.rules = ["SECRET-RULE"];
    raw.experiences = [
      {
        id: "E1",
        employer: "SECRET-EMPLOYER",
        titles: ["Developer"],
        start: "2020-01",
        location: "SECRET-CITY",
        type: "employment",
      },
    ];
    const base = {
      parent: "E1",
      tags: ["back-end"],
      ownership: "solo",
      sources: ["SECRET-SOURCE"],
    };
    raw.facts = [
      {
        ...base,
        id: "F1",
        text: "Built a nightly report.",
        ownership_note: "SECRET-NOTE",
      },
      { ...base, id: "F2", text: "SECRET-RETIRED-FACT", retired: true },
      {
        ...base,
        id: "F3",
        text: "SECRET-NO-RESUME-FACT",
        use: ["cover-letter", "interview"],
      },
      { ...base, id: "F4", text: "Wrote the deploy scripts.", use: ["resume"] },
    ];
    raw.skills = [
      {
        id: "S1",
        name: "TypeScript",
        aliases: ["SECRET-ALIAS"],
        evidence: ["F1"],
      },
      {
        id: "S2",
        name: "SECRET-RETIRED-SKILL",
        evidence: ["F1"],
        retired: true,
      },
    ];
    raw.do_not_claims = [{ id: "X1", text: "SECRET-DONOTCLAIM" }];
  });
  const summary = fitSummary(profile);

  it("lists Skill names and the text of resume Facts", () => {
    expect(summary).toContain("TypeScript");
    expect(summary).toContain("Built a nightly report.");
    expect(summary).toContain("Wrote the deploy scripts.");
  });

  it.each(SECRETS)("leaves out %s", (secret) => {
    expect(summary).not.toContain(secret);
  });

  it("uses the default surfaces, which include resume", () => {
    expect(summary).toContain("Built a nightly report.");
  });
});

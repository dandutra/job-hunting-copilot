import { stringify } from "yaml";

export type Raw = Record<string, unknown[] | Record<string, unknown>>;

export function validRaw(): Raw {
  return {
    sources: ["user", "repo"],
    contact: {
      name: "Test Person",
      city: "Testville",
      email: "test@example.com",
      links: ["https://example.com/test"],
    },
    experiences: [
      {
        id: "E1",
        employer: "Acme Widgets",
        titles: ["Developer"],
        start: "2020-01",
        end: "2021-06",
        location: "Testville",
        type: "employment",
      },
    ],
    projects: [{ id: "P1", name: "Widget Tool", links: [], repo: "x/y" }],
    education: [
      { id: "D1", school: "Test U", program: "BSc", start: "2016-09" },
    ],
    facts: [
      {
        id: "F1",
        parent: "E1",
        text: "Built a report.",
        tags: ["back-end"],
        ownership: "solo",
        sources: ["user"],
      },
    ],
    skills: [{ id: "S1", name: "TypeScript", evidence: ["F1"] }],
    do_not_claims: [{ id: "X1", text: "Never claim a degree in law." }],
  };
}

export function yamlOf(raw: Raw): string {
  return stringify(raw);
}

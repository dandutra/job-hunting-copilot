import { CompanyRelation, judgePair, SightingFacts } from "./pair-verdict";

const para = (seed: string, n = 80) =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");

function facts(overrides: Partial<SightingFacts> = {}): SightingFacts {
  return {
    jobSource: "jobspy-linkedin",
    title: "Software Developer",
    location: "Toronto, ON",
    description: "",
    descriptionKind: "none",
    ...overrides,
  };
}
const full = (text: string, more: Partial<SightingFacts> = {}) =>
  facts({ description: text, descriptionKind: "full", ...more });

const same: CompanyRelation = "same";

describe("judgePair", () => {
  it("merges two full descriptions at 0.9 or more", () => {
    const verdict = judgePair(full(para("a")), full(para("a")), same);
    expect(verdict).toMatchObject({ kind: "merge", method: "shingles" });
  });

  it("does not merge at 0.89, and gives a Lookalike", () => {
    const base = para("a", 400);
    const words = base.split(" ");
    // 9 changed words spread out kill 45 of 396 shingles, about 0.89 Jaccard.
    for (let i = 0; i < 9; i++) words[20 + i * 40] = `zz${i}`;
    const verdict = judgePair(full(base), full(words.join(" ")), same);
    expect(verdict).toMatchObject({ kind: "lookalike", reason: "same_title" });
  });

  it("vetoes two full descriptions that clearly differ", () => {
    expect(judgePair(full(para("a")), full(para("b")), same).kind).toBe("veto");
  });

  it("vetoes before any Lookalike case, whatever the title", () => {
    const verdict = judgePair(
      full(para("a"), { title: "Software Engineer II" }),
      full(para("b"), { title: "Software Engineer" }),
      same,
    );
    expect(verdict.kind).toBe("veto");
  });

  it("gives a Lookalike when one side has no description", () => {
    expect(judgePair(facts(), full(para("a")), same)).toMatchObject({
      kind: "lookalike",
      reason: "same_title",
    });
  });

  it("gives a Lookalike, not a veto, for a stub description", () => {
    expect(judgePair(full("short"), full(para("a")), same).kind).toBe(
      "lookalike",
    );
  });

  it("merges an Adzuna snippet found verbatim", () => {
    const text = para("a");
    const snippet = facts({
      jobSource: "adzuna",
      description: `${text.split(" ").slice(10, 40).join(" ")}...`,
      descriptionKind: "snippet",
    });
    expect(judgePair(snippet, full(text), same)).toMatchObject({
      kind: "merge",
      method: "snippet",
    });
    expect(judgePair(full(text), snippet, same).kind).toBe("merge");
  });

  it("gives a Lookalike for a snippet that differs by one sentence", () => {
    const text = para("a");
    const words = text.split(" ").slice(10, 40);
    words[12] = "changed";
    const snippet = facts({
      jobSource: "adzuna",
      description: words.join(" "),
      descriptionKind: "snippet",
    });
    expect(judgePair(snippet, full(text), same)).toMatchObject({
      kind: "lookalike",
    });
  });

  it("never merges on a snippet from a source other than Adzuna", () => {
    const text = para("a");
    const alert = facts({
      jobSource: "alert-indeed",
      description: text.split(" ").slice(10, 40).join(" "),
      descriptionKind: "snippet",
    });
    expect(judgePair(alert, full(text), same).kind).toBe("lookalike");
  });

  it("never merges 'Software Engineer II' with 'Software Engineer'", () => {
    const verdict = judgePair(
      full(para("a"), { title: "Software Engineer II" }),
      full(para("a"), { title: "Software Engineer" }),
      same,
    );
    expect(verdict).toMatchObject({
      kind: "lookalike",
      reason: "similar_title",
    });
  });

  it("gives a Lookalike, not a merge, when titles differ only in employment type", () => {
    const verdict = judgePair(
      full(para("a"), { title: "Software Engineer (Contract)" }),
      full(para("a"), { title: "Software Engineer" }),
      same,
    );
    expect(verdict).toMatchObject({
      kind: "lookalike",
      reason: "similar_title",
    });
  });

  it("gives a Lookalike, not a merge, between 0.5 and 0.9 similarity", () => {
    const base = para("a", 400);
    const words = base.split(" ");
    // 20 changed words spread out kill 100 of 396 shingles, about 0.6 Jaccard.
    for (let i = 0; i < 20; i++) words[10 + i * 19] = `zz${i}`;
    expect(judgePair(full(base), full(words.join(" ")), same)).toMatchObject({
      kind: "lookalike",
      reason: "same_title",
    });
  });

  it("gives a Lookalike for an equal title across similar company names", () => {
    expect(
      judgePair(full(para("a")), full(para("a")), "similar"),
    ).toMatchObject({ kind: "lookalike", reason: "similar_company" });
  });

  it("links nothing across a different metro, company or title", () => {
    expect(
      judgePair(
        full(para("a")),
        full(para("a"), { location: "Remote, Canada" }),
        same,
      ).kind,
    ).toBe("none");
    expect(judgePair(full(para("a")), full(para("a")), "other").kind).toBe(
      "none",
    );
    expect(
      judgePair(facts(), facts({ title: "Account Executive" }), same).kind,
    ).toBe("none");
  });

  it("links no titles made only of employment words", () => {
    expect(
      judgePair(
        facts({ title: "Contract" }),
        facts({ title: "Part Time" }),
        same,
      ).kind,
    ).toBe("none");
  });

  it("treats a title of only noise as no title", () => {
    expect(
      judgePair(
        facts({ title: "(Hybrid)" }),
        facts({ title: "(Remote)" }),
        same,
      ).kind,
    ).toBe("none");
  });
});

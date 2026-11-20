import { readFileSync } from "node:fs";
import {
  loadSearchTerms,
  loadTitleFilter,
  readTitleFilter,
  titlePasses,
} from "./title-filter";

describe("titlePasses, with the committed config", () => {
  it.each([
    "AI Software Engineer",
    "Python Full Stack Developer – GenAI",
    "AI & Automation Engineer (Enterprise)",
    "Member of Technical Staff, Agent Code",
    "Member of Technical Staff (Fullstack) (Toronto)",
    "Member of Technical Staff - Forward Deployed Engineer",
    "Software Developer",
    "Internal Tools Developer",
    "Junior Full Stack Developer",
    "Developer, Staffing Platform",
    "Lead Developer",
    "Back-end Developer",
    "Front End / Web Engineer",
    "SRE",
    "SRE II, Payments",
    "Engineer, Software",
    "Engineer, Software - Cloud Platform",
  ])("passes %s", (title) => {
    expect(titlePasses(title)).toBe(true);
  });

  it.each([
    // Exclude words, as before.
    "Senior Software Engineer",
    "Sr. Developer",
    "Director, Engineering",
    "Software Developer Intern",
    "Co-op Developer (Winter 2027)",
    "(Senior) Developer",
    "Staff Engineer",
    "Senior Member of Technical Staff",
    "Senior SRE",
    "Staff Engineer, Software",
    // Machine learning is a different kind of work.
    "ML Software Engineer, Routing",
    "AI/ML Engineer",
    "Machine Learning Developer",
    // No include phrase.
    "Data Scientist",
    "Account Executive",
    "Mechanical Engineer",
    "Software Architect",
    // Whole words: "AI engineer" is not a run inside this title.
    "Physical Design Engineer, AI Accelerator IP",
    "Software Engineering Intern",
    "Seniority Tracker Analyst",
  ])("fails %s", (title) => {
    expect(titlePasses(title)).toBe(false);
  });
});

describe("the committed config", () => {
  it("loads", () => {
    const text = readFileSync("../../config/title-filter.json", "utf8");
    expect(() => loadTitleFilter(text)).not.toThrow();
  });

  it("has search terms", () => {
    const text = readFileSync("../../config/title-filter.json", "utf8");
    expect(loadSearchTerms(text)).toEqual([
      "software developer",
      "software engineer",
      "full stack developer",
      "AI engineer",
      "AI developer",
    ]);
  });
});

describe("loadTitleFilter", () => {
  const valid = {
    include: ["developer"],
    exclude: ["senior"],
    exempt: [],
  };
  const load = (value: unknown) => loadTitleFilter(JSON.stringify(value));

  it("judges a title by its own lists", () => {
    const filter = load({
      include: ["widget maker"],
      exclude: ["lead"],
      exempt: ["lead widget maker"],
    });
    expect(filter.passes("Widget-Maker")).toBe(true);
    expect(filter.passes("Lead Widget Maker")).toBe(true);
    expect(filter.passes("Lead Widget Maker II, Lead")).toBe(false);
    expect(filter.passes("Developer")).toBe(false);
  });

  it("rejects invalid JSON, naming the file", () => {
    expect(() => loadTitleFilter("{nope")).toThrow(
      "title filter: the file is not valid JSON",
    );
  });

  it("rejects a missing file, naming its path", () => {
    expect(() => readTitleFilter("/nonexistent/title-filter.json")).toThrow(
      "title filter: cannot read /nonexistent/title-filter.json",
    );
  });

  it("rejects a file that is not an object", () => {
    expect(() => load([])).toThrow("title filter: the file must be an object");
  });

  it.each(["include", "exclude", "exempt"])(
    "rejects a missing %s list",
    (key) => {
      const bad: Record<string, unknown> = { ...valid };
      delete bad[key];
      expect(() => load(bad)).toThrow(`title filter: ${key} must be a list`);
    },
  );

  it("rejects an empty include list", () => {
    expect(() => load({ ...valid, include: [] })).toThrow(
      "title filter: include must not be empty",
    );
  });

  it.each(["include", "exclude", "exempt"])(
    "rejects a non-string entry in %s",
    (key) => {
      expect(() => load({ ...valid, [key]: ["ok", 3] })).toThrow(
        `title filter: ${key}[1] must be a non-blank string`,
      );
    },
  );

  it("rejects a blank entry", () => {
    expect(() => load({ ...valid, exclude: ["  "] })).toThrow(
      "title filter: exclude[0] must be a non-blank string",
    );
  });

  it("ignores other keys, such as #124's searchTerms", () => {
    expect(() => load({ ...valid, searchTerms: ["x"] })).not.toThrow();
  });
});

describe("loadSearchTerms", () => {
  const load = (value: unknown) => loadSearchTerms(JSON.stringify(value));

  it("returns the terms trimmed, in file order, with their case kept", () => {
    expect(
      load({ searchTerms: [" AI engineer", "software developer "] }),
    ).toEqual(["AI engineer", "software developer"]);
  });

  it("rejects invalid JSON", () => {
    expect(() => loadSearchTerms("{nope")).toThrow(
      "title filter: the file is not valid JSON",
    );
  });

  it("rejects a missing list", () => {
    expect(() => load({})).toThrow("title filter: searchTerms must be a list");
  });

  it("rejects an empty list", () => {
    expect(() => load({ searchTerms: [] })).toThrow(
      "title filter: searchTerms must not be empty",
    );
  });

  it.each([3, "  "])("rejects the entry %j", (entry) => {
    expect(() => load({ searchTerms: ["ok", entry] })).toThrow(
      "title filter: searchTerms[1] must be a non-blank string",
    );
  });
});

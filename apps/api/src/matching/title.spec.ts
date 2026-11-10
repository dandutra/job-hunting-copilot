import { normalizeTitle, titleSimilarity } from "./title";

describe("normalizeTitle", () => {
  it.each([
    ["Software Engineer (Hybrid)", "software engineer"],
    ["Software Engineer - Toronto", "software engineer"],
    ["Software Engineer - Toronto, ON - Hybrid", "software engineer"],
    ["Software Engineer - JR26100844", "software engineer"],
    ["JR26100844 Software Engineer", "software engineer"],
    ["Sr. Software Dev", "senior software developer"],
    ["Jr Eng", "junior engineer"],
    ["SWE II", "software engineer 2"],
    ["Software Engineer III", "software engineer 3"],
    ["Software Engineer 2", "software engineer 2"],
    ["Software   Engineer,  Platform!", "software engineer platform"],
  ])("turns %j into %j", (raw, expected) => {
    expect(normalizeTitle(raw)).toBe(expected);
  });

  it("keeps a dash suffix or bracket that is not noise", () => {
    expect(normalizeTitle("Software Engineer - Payments")).toBe(
      "software engineer payments",
    );
    expect(normalizeTitle("Software Engineer (Backend)")).toBe(
      "software engineer backend",
    );
  });

  it("keeps the employment type, so full time never equals part time", () => {
    expect(normalizeTitle("Cashier - Full Time")).not.toBe(
      normalizeTitle("Cashier - Part Time"),
    );
    expect(normalizeTitle("Engineer (Contract)")).not.toBe(
      normalizeTitle("Engineer (Permanent)"),
    );
  });

  it("keeps the level, so a level never equals none", () => {
    expect(normalizeTitle("Software Engineer II")).not.toBe(
      normalizeTitle("Software Engineer"),
    );
  });

  it("keeps C++, C# and .NET apart from C", () => {
    const titles = [
      "C++ Developer",
      "C# Developer",
      "C Developer",
      ".NET Developer",
    ].map(normalizeTitle);
    expect(new Set(titles).size).toBe(4);
  });

  it("gives a blank string for a title of only noise", () => {
    expect(normalizeTitle("(Hybrid)")).toBe("");
  });
});

describe("titleSimilarity", () => {
  it("is 1 for equal normalized titles and between 0.8 and 1 for a level apart", () => {
    expect(
      titleSimilarity("Sr Software Dev", "Senior Software Developer"),
    ).toBe(1);
    const level = titleSimilarity("Software Engineer II", "Software Engineer");
    expect(level).toBeGreaterThanOrEqual(0.8);
    expect(level).toBeLessThan(1);
  });

  it("is under 0.8 for different jobs", () => {
    expect(
      titleSimilarity("Software Engineer", "Account Executive"),
    ).toBeLessThan(0.8);
  });
});

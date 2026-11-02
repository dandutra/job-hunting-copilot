import { boardOf, normalizeListingKey, parseListingKey } from "./listing-key";

describe("parseListingKey", () => {
  it.each([
    [
      "https://boards.greenhouse.io/acme/jobs/4012345",
      "greenhouse:acme:4012345",
    ],
    [
      "https://job-boards.greenhouse.io/Acme/jobs/4012345?gh_src=x",
      "greenhouse:acme:4012345",
    ],
    [
      "https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345",
      "greenhouse:acme:4012345",
    ],
    [
      "https://jobs.lever.co/acme/0a1b2c3d-1111-2222-3333-444455556666/apply",
      "lever:acme:0a1b2c3d-1111-2222-3333-444455556666",
    ],
    [
      "https://jobs.ashbyhq.com/acme/0a1b2c3d-1111-2222-3333-444455556666",
      "ashby:acme:0a1b2c3d-1111-2222-3333-444455556666",
    ],
    [
      "https://jobs.smartrecruiters.com/Acme/744000012345678-software-engineer",
      "smartrecruiters:acme:744000012345678",
    ],
    [
      "https://acme.wd3.myworkdayjobs.com/en-US/External/job/Toronto-ON/Software-Developer_JR100-2",
      "workday:acme:jr100",
    ],
    [
      "https://acme.wd3.myworkdayjobs.com/External/job/Toronto-ON/Software-Developer_R-12345/apply",
      "workday:acme:r-12345",
    ],
  ])("parses %s", (url, key) => {
    expect(parseListingKey(url)).toBe(key);
  });

  it.each([
    "not a url",
    "https://example.com/careers/123",
    "https://boards.greenhouse.io/acme",
    "https://jobs.lever.co/acme",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/acme/publication/x",
    "https://acme.wd3.myworkdayjobs.com/External",
    "https://acme.wd3.myworkdayjobs.com/External/job/Toronto/no-requisition",
    "ftp://boards.greenhouse.io/acme/jobs/1",
  ])("ignores %s", (url) => {
    expect(parseListingKey(url)).toBeNull();
  });
});

describe("normalizeListingKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeListingKey(" LinkedIn:123 ")).toBe("linkedin:123");
  });

  it("strips the Workday site suffix when the requisition keeps a digit", () => {
    expect(normalizeListingKey("workday:acme:JR100-1")).toBe(
      "workday:acme:jr100",
    );
    expect(normalizeListingKey("workday:acme:R-12345-2")).toBe(
      "workday:acme:r-12345",
    );
  });

  it.each([
    ["workday:acme:JR-2024-0042", "workday:acme:jr-2024-0042"],
    ["workday:acme:2024-12345", "workday:acme:2024-12345"],
    ["workday:acme:JR-2024-5", "workday:acme:jr-2024-5"],
  ])("keeps the sequence number of %s", (key, normalized) => {
    expect(normalizeListingKey(key)).toBe(normalized);
  });

  it("keeps a requisition id whose dash is part of the id", () => {
    expect(normalizeListingKey("workday:acme:R-12345")).toBe(
      "workday:acme:r-12345",
    );
  });
});

describe("boardOf", () => {
  it("names the board an ATS key sits on", () => {
    expect(boardOf("greenhouse:acme:1")).toBe("greenhouse:acme");
    expect(boardOf("workday:acme:jr1")).toBe("workday:acme");
  });

  it("names the Job source for an aggregator key", () => {
    expect(boardOf("linkedin:1")).toBe("linkedin");
    expect(boardOf("indeed:abc")).toBe("indeed");
  });
});

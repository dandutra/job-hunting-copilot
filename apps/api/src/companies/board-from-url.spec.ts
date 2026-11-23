import { boardFromUrl } from "./board-from-url";

const UUID = "0b6f1b1e-3c1a-4d57-9c1e-2f4d6a8b9c10";

describe("boardFromUrl", () => {
  it.each([
    [
      "greenhouse",
      "https://boards.greenhouse.io/acme/jobs/123456",
      { ats: "greenhouse", boardSlug: "acme" },
    ],
    [
      "greenhouse job-boards host",
      "https://job-boards.greenhouse.io/acme/jobs/123456?gh_src=x",
      { ats: "greenhouse", boardSlug: "acme" },
    ],
    [
      "greenhouse embed form",
      "https://boards.greenhouse.io/embed/job_app?for=acme&token=123456",
      { ats: "greenhouse", boardSlug: "acme" },
    ],
    [
      "lever",
      `https://jobs.lever.co/acme/${UUID}/apply`,
      { ats: "lever", boardSlug: "acme" },
    ],
    [
      "ashby",
      `https://jobs.ashbyhq.com/acme/${UUID}`,
      { ats: "ashby", boardSlug: "acme" },
    ],
    [
      "smartrecruiters",
      "https://jobs.smartrecruiters.com/Acme/743999-software-engineer",
      { ats: "smartrecruiters", boardSlug: "Acme" },
    ],
  ])("reads a %s link", (_name, url, board) => {
    expect(boardFromUrl(url)).toEqual(board);
  });

  it("reads a Workday link with a locale segment", () => {
    expect(
      boardFromUrl(
        "https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1/job/Toronto/Engineer_R-123",
      ),
    ).toEqual({ ats: "workday", boardSlug: "rbc.wd3/RBCGLOBAL1" });
  });

  it("reads a Workday link without a locale segment", () => {
    expect(
      boardFromUrl(
        "https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/Toronto/Engineer_R-123",
      ),
    ).toEqual({ ats: "workday", boardSlug: "rbc.wd3/RBCGLOBAL1" });
  });

  it("keeps a percent-encoded slug as it stands in the URL", () => {
    expect(
      boardFromUrl(`https://jobs.ashbyhq.com/PAR%20Technology/${UUID}`),
    ).toEqual({ ats: "ashby", boardSlug: "PAR%20Technology" });
  });

  it.each([
    "https://www.indeed.com/viewjob?jk=abc",
    "https://boards.greenhouse.io/acme",
    "https://jobs.lever.co/acme",
    "https://acme.com/careers/123",
    `https://jobs.eu.lever.co/acme/${UUID}`,
    "https://boards.eu.greenhouse.io/acme/jobs/123456",
    "https://job-boards.eu.greenhouse.io/acme/jobs/123456",
    "not a url",
  ])("returns null for %s", (url) => {
    expect(boardFromUrl(url)).toBeNull();
  });
});

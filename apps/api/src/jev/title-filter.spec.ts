import { titleFiltered } from "./title-filter";

describe("titleFiltered", () => {
  it.each([
    "Senior Software Engineer",
    "Sr. Developer",
    "Director, Engineering",
    "Software Developer Intern",
    "Co-op Developer (Winter 2027)",
    "(Senior) Developer",
    "SENIOR developer",
    "Coop Student",
    "Staff Engineer",
    "Principal Engineer",
    "Head of Platform",
    "VP Engineering",
    "Vice President, Technology",
    "Engineering Manager",
    "Developer Internship",
    "Student Developer",
  ])("matches %s", (title) => {
    expect(titleFiltered(title)).toBe(true);
  });

  it.each([
    "Software Developer",
    "Internal Tools Developer",
    "Junior Full Stack Developer",
    "Developer, Staffing Platform",
    "Lead Developer",
    "Software Architect",
    "Seniority Tracker Developer",
  ])("does not match %s", (title) => {
    expect(titleFiltered(title)).toBe(false);
  });
});

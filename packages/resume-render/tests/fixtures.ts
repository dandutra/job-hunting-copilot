import type { LetterModel, ResumeJob, ResumeModel } from "../src/model";

// Invented person and employers. Plausible names matter: Greenhouse's parser fails on "Company 1".
export const fakeResume: ResumeModel = {
  title: "Jordan Rivers - Resume",
  contact: {
    name: "Jordan Rivers",
    city: "Toronto, ON",
    email: "jordan.rivers@example.com",
    phone: "416-555-0100",
    links: [
      "https://github.com/example-jordan",
      "https://www.linkedin.com/in/example-jordan",
    ],
  },
  highlights: [
    "Five years of building and supporting business software for teams of up to 40 people.",
    "Trained new hires and ran the weekly help desk for a logistics company.",
  ],
  experience: [
    {
      title: "Software Developer",
      org: "Northwind Systems Inc.",
      location: "Toronto, ON",
      start: "2022-03",
      end: "2024-08",
      lines: [
        "Cut the nightly report from 40 minutes to 6 by moving it to a queue.",
        "Added role checks to the admin screens after an access review.",
      ],
    },
    {
      title: "Support Analyst",
      org: "Lakeshore Logistics Ltd.",
      location: "Mississauga, ON",
      start: "2020-06",
      end: "2022-02",
      lines: [
        "Answered 30 customer tickets a day with a 95% satisfaction score.",
      ],
    },
  ],
  projects: [
    {
      name: "Inventory Tracker",
      links: ["https://github.com/example-jordan/inventory-tracker"],
    },
    { name: "Trail Notes", links: [] },
  ],
  education: [
    {
      school: "Lakeview College",
      program: "Computer Programming Diploma",
      start: "2018-09",
      end: "2020-04",
    },
  ],
  skills: ["TypeScript", "PostgreSQL", "Docker", "Customer support"],
  volunteer: [
    {
      title: "Mentor",
      org: "Code Neighbours Society",
      location: "Toronto, ON",
      start: "2023-01",
      lines: ["Ran a weekly help session for 8 beginners."],
    },
  ],
};

// A resume long enough to need two pages, built from the one-page fixture.
export function longFakeResume(): ResumeModel {
  const jobs: ResumeJob[] = Array.from({ length: 8 }, (_, i) => ({
    title: `Systems Analyst ${i + 1}`,
    org: `Harbourfront Partners ${i + 1} Inc.`,
    location: "Toronto, ON",
    start: `${2010 + i}-01`,
    end: `${2010 + i}-12`,
    lines: [
      `Led project ${i + 1} from request to release with a team of four.`,
      `Wrote the runbook for service ${i + 1} and trained two new hires.`,
      `Reduced the error rate of system ${i + 1} by a third in six months.`,
    ],
  }));
  return { ...fakeResume, experience: jobs };
}

// Invented, like the resume above. The Company is a made-up employer.
export const fakeLetter: LetterModel = {
  title: "Jordan Rivers - Cover letter",
  contact: fakeResume.contact,
  date: "2026-11-19",
  company: "Fabrikam Analytics Inc.",
  greeting: "Dear Hiring Manager,",
  paragraphs: [
    "I am applying for the Software Developer role at Fabrikam Analytics. I have spent two years moving slow reports onto queues, and your posting describes the same problem.",
    "At Northwind Systems I cut a nightly report from 40 minutes to 6. I also added role checks to the admin screens after an access review.",
    "I would welcome a conversation about how I can help your team.",
  ],
  signOff: "Sincerely,",
};

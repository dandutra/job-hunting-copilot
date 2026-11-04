// PROTOTYPE data. Every Company, Posting, Fact and Do-not-claim here is invented.

export type Tier = "A" | "B" | "C";
export type LabelAnswer = Tier | "cant_tell";

export interface Sighting {
  source: string;
  url: string;
  seenDaysAgo: number;
  lastSeenDaysAgo: number;
}

export interface Posting {
  id: string;
  title: string;
  company: string;
  location: string;
  arrangement: "hybrid" | "remote" | "on-site";
  roleFamily: string;
  tier: Tier;
  why: string[];
  cap?: string;
  thin: boolean;
  ats: "Greenhouse" | "Workday" | "Lever" | "Ashby" | "LinkedIn" | "Indeed";
  sightings: Sighting[];
  text: string;
  lookalike?: { otherId: string; reason: string };
  hasDraft?: boolean;
}

const lorem = (lead: string) =>
  `${lead}\n\nWhat you'll do\n- Build and ship features across a TypeScript and React front end and a Node or Java back end.\n- Write tests, review code and pair with senior engineers.\n- Take part in on-call once you're ramped up.\n\nWhat we're looking for\n- A degree or diploma in computer science or a related field, or equivalent experience.\n- 0 to 2 years of professional experience, co-ops included.\n- Comfort with SQL and one cloud provider.\n\nNice to have\n- Docker, CI/CD, and some exposure to AWS or GCP.\n\nWe offer a hybrid schedule with 3 days a week in our Toronto office.`;

export const postings: Posting[] = [
  {
    id: "p-101",
    title: "Junior Full Stack Developer",
    company: "Northwind Bank",
    location: "Toronto, ON",
    arrangement: "hybrid",
    roleFamily: "full-stack",
    tier: "A",
    why: ["Fit: strong (+6)", "Role family full-stack (+2)", "Hybrid (+1)"],
    thin: false,
    ats: "Workday",
    hasDraft: true,
    sightings: [
      {
        source: "Workday",
        url: "https://northwind.wd3.myworkdayjobs.com/careers/job/R-1182",
        seenDaysAgo: 0,
        lastSeenDaysAgo: 0,
      },
      {
        source: "JobSpy-Indeed",
        url: "https://ca.indeed.com/viewjob?jk=9a1f",
        seenDaysAgo: 0,
        lastSeenDaysAgo: 0,
      },
      {
        source: "Alert inbox",
        url: "https://ca.indeed.com/viewjob?jk=9a1f",
        seenDaysAgo: 0,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem(
      "Northwind Bank's digital team is hiring a junior developer to work on online banking.",
    ),
  },
  {
    id: "p-102",
    title: "Software Developer I, Platform",
    company: "Maple Freight",
    location: "Mississauga, ON",
    arrangement: "hybrid",
    roleFamily: "back-end",
    tier: "A",
    why: ["Fit: strong (+6)", "Role family back-end (+1)", "Hybrid (+1)"],
    thin: false,
    ats: "Greenhouse",
    sightings: [
      {
        source: "Greenhouse",
        url: "https://boards.greenhouse.io/maplefreight/jobs/4410",
        seenDaysAgo: 1,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem(
      "Maple Freight moves goods across Canada. Join the platform team behind our shipment APIs.",
    ),
    lookalike: {
      otherId: "p-108",
      reason:
        "Same Company and title, Toronto vs Mississauga, text 0.82 similar",
    },
  },
  {
    id: "p-103",
    title: "New Grad Software Engineer",
    company: "Lakeshore Health",
    location: "Toronto, ON",
    arrangement: "on-site",
    roleFamily: "full-stack",
    tier: "B",
    why: ["Fit: good (+4)", "Role family full-stack (+2)", "On-site (0)"],
    thin: false,
    ats: "Ashby",
    sightings: [
      {
        source: "Ashby",
        url: "https://jobs.ashbyhq.com/lakeshore/7c2e",
        seenDaysAgo: 2,
        lastSeenDaysAgo: 0,
      },
      {
        source: "JobSpy-LinkedIn",
        url: "https://www.linkedin.com/jobs/view/38110",
        seenDaysAgo: 1,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem(
      "Lakeshore Health builds scheduling tools for clinics across Ontario.",
    ),
  },
  {
    id: "p-104",
    title: "Cloud Operations Analyst",
    company: "Granite Telecom",
    location: "Toronto, ON",
    arrangement: "hybrid",
    roleFamily: "cloud/ops",
    tier: "B",
    why: ["Fit: good (+4)", "Role family cloud/ops (0)", "Hybrid (+1)"],
    thin: true,
    ats: "LinkedIn",
    sightings: [
      {
        source: "Alert inbox",
        url: "https://www.linkedin.com/jobs/view/38422",
        seenDaysAgo: 0,
        lastSeenDaysAgo: 0,
      },
    ],
    text: "Granite Telecom is looking for a Cloud Operations Analyst to support our hybrid cloud estate…",
  },
  {
    id: "p-105",
    title: "Front End Developer (React)",
    company: "Birchwood Media",
    location: "Remote, Canada",
    arrangement: "remote",
    roleFamily: "front-end",
    tier: "B",
    why: ["Fit: good (+4)", "Role family front-end (+1)", "Remote (+0.5)"],
    thin: false,
    ats: "Lever",
    sightings: [
      {
        source: "Lever",
        url: "https://jobs.lever.co/birchwood/aa21",
        seenDaysAgo: 4,
        lastSeenDaysAgo: 0,
      },
      {
        source: "Adzuna",
        url: "https://www.adzuna.ca/land/ad/5521",
        seenDaysAgo: 3,
        lastSeenDaysAgo: 1,
      },
    ],
    text: lorem(
      "Birchwood Media runs streaming sites for Canadian broadcasters.",
    ),
  },
  {
    id: "p-106",
    title: "Senior Backend Engineer",
    company: "Northwind Bank",
    location: "Toronto, ON",
    arrangement: "hybrid",
    roleFamily: "back-end",
    tier: "C",
    why: ["Fit: strong (+6)", "Tier cap held it at C"],
    cap: "Closed to juniors: asks for 7+ years",
    thin: false,
    ats: "Workday",
    sightings: [
      {
        source: "Workday",
        url: "https://northwind.wd3.myworkdayjobs.com/careers/job/R-1190",
        seenDaysAgo: 0,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem(
      "Northwind Bank needs a senior engineer with 7+ years to lead payments services.",
    ),
  },
  {
    id: "p-107",
    title: "Développeur logiciel junior",
    company: "Fleuve Assurance",
    location: "Montréal, QC",
    arrangement: "on-site",
    roleFamily: "full-stack",
    tier: "C",
    why: ["Fit: good (+4)", "Tier cap held it at C"],
    cap: "Outside the GTA; requires French",
    thin: false,
    ats: "Indeed",
    sightings: [
      {
        source: "JobSpy-Indeed",
        url: "https://ca.indeed.com/viewjob?jk=77be",
        seenDaysAgo: 3,
        lastSeenDaysAgo: 2,
      },
    ],
    text: lorem("Fleuve Assurance cherche un développeur junior."),
  },
  {
    id: "p-108",
    title: "Software Developer I, Platform",
    company: "Maple Freight Inc.",
    location: "Toronto, ON",
    arrangement: "hybrid",
    roleFamily: "back-end",
    tier: "B",
    why: ["Fit: good (+4)", "Role family back-end (+1)", "Hybrid (+1)"],
    thin: false,
    ats: "LinkedIn",
    sightings: [
      {
        source: "JobSpy-LinkedIn",
        url: "https://www.linkedin.com/jobs/view/38999",
        seenDaysAgo: 1,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem("Maple Freight is growing its platform team in Toronto."),
    lookalike: {
      otherId: "p-102",
      reason:
        "Same Company and title, Toronto vs Mississauga, text 0.82 similar",
    },
  },
  {
    id: "p-109",
    title: "IT Support Specialist",
    company: "Cedar College",
    location: "Toronto, ON",
    arrangement: "on-site",
    roleFamily: "support",
    tier: "C",
    why: ["Fit: weak (+1)", "Role family support (-1)", "On-site (0)"],
    thin: true,
    ats: "Indeed",
    sightings: [
      {
        source: "Adzuna",
        url: "https://www.adzuna.ca/land/ad/5590",
        seenDaysAgo: 6,
        lastSeenDaysAgo: 6,
      },
    ],
    text: "",
  },
  {
    id: "p-110",
    title: "Associate Software Engineer",
    company: "Harbourfront Games",
    location: "Toronto, ON",
    arrangement: "hybrid",
    roleFamily: "full-stack",
    tier: "A",
    why: ["Fit: strong (+5)", "Role family full-stack (+2)", "Hybrid (+1)"],
    thin: false,
    ats: "Greenhouse",
    sightings: [
      {
        source: "Greenhouse",
        url: "https://boards.greenhouse.io/harbourfront/jobs/1201",
        seenDaysAgo: 3,
        lastSeenDaysAgo: 0,
      },
    ],
    text: lorem("Harbourfront Games makes tools for indie studios."),
  },
];

export const byId = (id: string) => postings.find((p) => p.id === id)!;

export function sortFeed(list: Posting[]) {
  const order = { A: 0, B: 1, C: 2 };
  return [...list].sort(
    (a, b) => order[a.tier] - order[b.tier] || postedAt(a) - postedAt(b),
  );
}

export const postedAt = (p: Posting) =>
  Math.max(...p.sightings.map((s) => s.seenDaysAgo));

export const age = (days: number) => (days === 0 ? "today" : `${days}d ago`);

// Identical URLs from two Job sources show as one link.
export function linksOf(p: Posting) {
  const map = new Map<string, string[]>();
  for (const s of p.sightings)
    map.set(s.url, [...(map.get(s.url) ?? []), s.source]);
  return [...map.entries()].map(([url, sources]) => ({ url, sources }));
}

export const uploadHint = (ats: Posting["ats"]) =>
  ats === "Workday" ? "DOCX" : "PDF";

// ---------- Label queue ----------

export const labelBatch = [
  "p-103",
  "p-110",
  "p-106",
  "p-105",
  "p-101",
  "p-107",
  "p-108",
  "p-102",
  "p-103",
  "p-110",
];

// ---------- Tailored resume review ----------

export type Verdict =
  | { kind: "pass" }
  | { kind: "dnc"; dncId: string }
  | { kind: "note"; note: string };

export interface DraftLine {
  id: string;
  section: string;
  text: string;
  cites: string[];
  verdict: Verdict;
}

export const facts: Record<
  string,
  { text: string; ownership: string; source: string }
> = {
  "F-12": {
    text: "Built a React page that lets support staff search customer orders.",
    ownership: "solo",
    source: "Co-op notes, term 3",
  },
  "F-13": {
    text: "Cut the order search page's load time from about 4 s to about 1.5 s by adding an index and paging.",
    ownership: "solo",
    source: "Co-op notes, term 3",
  },
  "F-21": {
    text: "Helped migrate two services from a VM to Docker containers on AWS ECS.",
    ownership: "team",
    source: "Co-op notes, term 4",
  },
  "F-22": {
    text: "Wrote the GitHub Actions workflow that runs the service's unit tests on each pull request.",
    ownership: "solo",
    source: "Co-op notes, term 4",
  },
  "F-30": {
    text: "Built a budgeting web app with NestJS, Postgres and React, used by 12 friends.",
    ownership: "solo",
    source: "Project README",
  },
  "S-1": {
    text: "Skill: TypeScript (aliases: TS)",
    ownership: "",
    source: "Skills",
  },
  "S-2": { text: "Skill: React", ownership: "", source: "Skills" },
  "S-3": {
    text: "Skill: PostgreSQL (aliases: Postgres)",
    ownership: "",
    source: "Skills",
  },
};

export const doNotClaims = [
  { id: "DNC-1", text: "Never claim production on-call experience." },
  { id: "DNC-2", text: "Never claim Kubernetes experience." },
  {
    id: "DNC-3",
    text: "Never call the budgeting app a product with customers.",
  },
];

export const draft: {
  postingId: string;
  pastedText: string | null;
  lines: DraftLine[];
  cover: DraftLine[];
} = {
  postingId: "p-101",
  pastedText: null,
  lines: [
    {
      id: "L1",
      section: "Summary",
      text: "Junior full-stack developer with two co-op terms building React and Node features and shipping them through CI.",
      cites: ["F-12", "F-22"],
      verdict: { kind: "pass" },
    },
    {
      id: "L2",
      section: "Acme Retail · Software Developer Co-op",
      text: "Built a React order search page for support staff.",
      cites: ["F-12"],
      verdict: { kind: "pass" },
    },
    {
      id: "L3",
      section: "Acme Retail · Software Developer Co-op",
      text: "Cut order search load time by 80% with an index and paging.",
      cites: ["F-13"],
      verdict: {
        kind: "note",
        note: "Fact says about 4 s to 1.5 s, which is about 62%, not 80%.",
      },
    },
    {
      id: "L4",
      section: "Lumen Logistics · DevOps Co-op",
      text: "Led the migration of two services to Docker on AWS ECS.",
      cites: ["F-21"],
      verdict: {
        kind: "note",
        note: 'Fact is team work; "led" claims ownership it doesn\'t state.',
      },
    },
    {
      id: "L5",
      section: "Lumen Logistics · DevOps Co-op",
      text: "Wrote the CI workflow that runs unit tests on each pull request, and supported the services on call.",
      cites: ["F-22"],
      verdict: { kind: "dnc", dncId: "DNC-1" },
    },
    {
      id: "L6",
      section: "Projects · Budget app",
      text: "Built a budgeting web app with NestJS, Postgres and React.",
      cites: ["F-30"],
      verdict: { kind: "pass" },
    },
    {
      id: "L7",
      section: "Skills",
      text: "TypeScript, React, PostgreSQL",
      cites: ["S-1", "S-2", "S-3"],
      verdict: { kind: "pass" },
    },
  ],
  cover: [
    {
      id: "C1",
      section: "Cover letter ¶1",
      text: "I'm applying for the Junior Full Stack Developer role because I've spent two co-op terms building the kind of React and Node features your digital team ships.",
      cites: ["F-12", "F-22"],
      verdict: { kind: "pass" },
    },
    {
      id: "C2",
      section: "Cover letter ¶2",
      text: "At Acme Retail I made the order search page about twice as fast by adding an index and paging.",
      cites: ["F-13"],
      verdict: { kind: "pass" },
    },
  ],
};

// ---------- Merge log ----------

export type Rule = "exact key" | "Indeed URL to ATS key" | "text";

export interface MergeEntry {
  id: string;
  rule: Rule;
  postingId: string;
  left: {
    source: string;
    title: string;
    company: string;
    location: string;
    url: string;
  };
  right: {
    source: string;
    title: string;
    company: string;
    location: string;
    url: string;
  };
  evidence: string;
  daysAgo: number;
}

const ex = (i: number, company: string, title: string): MergeEntry => ({
  id: `m-${i}`,
  rule: "exact key",
  postingId: "p-101",
  left: {
    source: "Workday",
    title,
    company,
    location: "Toronto, ON",
    url: `https://x.wd3.myworkdayjobs.com/job/R-${1000 + i}`,
  },
  right: {
    source: "Workday",
    title,
    company,
    location: "Toronto, ON",
    url: `https://x.wd3.myworkdayjobs.com/job/R-${1000 + i}_1`,
  },
  evidence: `Same Workday requisition R-${1000 + i} after the suffix strip`,
  daysAgo: i % 4,
});

export const mergeLog: MergeEntry[] = [
  {
    id: "m-1",
    rule: "text",
    postingId: "p-103",
    left: {
      source: "Ashby",
      title: "New Grad Software Engineer",
      company: "Lakeshore Health",
      location: "Toronto, ON",
      url: "https://jobs.ashbyhq.com/lakeshore/7c2e",
    },
    right: {
      source: "JobSpy-LinkedIn",
      title: "New Grad Software Engineer",
      company: "Lakeshore Health Inc.",
      location: "Toronto, Ontario, Canada",
      url: "https://www.linkedin.com/jobs/view/38110",
    },
    evidence:
      "Same Company through alias, same normalized title, same metro, shingle similarity 0.96",
    daysAgo: 1,
  },
  {
    id: "m-2",
    rule: "Indeed URL to ATS key",
    postingId: "p-101",
    left: {
      source: "Workday",
      title: "Junior Full Stack Developer",
      company: "Northwind Bank",
      location: "Toronto, ON",
      url: "https://northwind.wd3.myworkdayjobs.com/careers/job/R-1182",
    },
    right: {
      source: "JobSpy-Indeed",
      title: "Jr. Full-Stack Developer",
      company: "Northwind Bank",
      location: "Toronto, ON",
      url: "https://ca.indeed.com/viewjob?jk=9a1f",
    },
    evidence:
      "Indeed direct URL parses to Workday northwind/wd3/careers R-1182",
    daysAgo: 0,
  },
  {
    id: "m-3",
    rule: "text",
    postingId: "p-105",
    left: {
      source: "Lever",
      title: "Front End Developer (React)",
      company: "Birchwood Media",
      location: "Remote, Canada",
      url: "https://jobs.lever.co/birchwood/aa21",
    },
    right: {
      source: "Adzuna",
      title: "Front End Developer - React",
      company: "Birchwood Media",
      location: "Toronto",
      url: "https://www.adzuna.ca/land/ad/5521",
    },
    evidence:
      "Adzuna snippet (500 chars) found word for word in the Lever description",
    daysAgo: 3,
  },
  ...Array.from({ length: 9 }, (_, i) =>
    ex(
      i + 4,
      ["Northwind Bank", "Granite Telecom", "Maple Freight"][i % 3],
      ["Analyst, Data", "Developer II", "QA Engineer"][i % 3],
    ),
  ),
];

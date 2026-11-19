import type {
  LetterModel,
  ResumeContact,
  ResumeJob,
  ResumeModel,
} from "./model";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function month(date: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(-\d{2})?$/.exec(date);
  if (!m)
    throw new Error(`Bad resume date "${date}": use YYYY-MM or YYYY-MM-DD`);
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// The one date format in both files, because Greenhouse lists differing formats as a parse failure.
export function formatDates(start: string, end?: string): string {
  return `${month(start)} - ${end ? month(end) : "Present"}`;
}

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The letter's one date format, "November 19, 2026". It rejects a day the month does not have.
export function formatLetterDate(date: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(date);
  const bad = new Error(`Bad letter date "${date}": use YYYY-MM-DD`);
  if (!m) throw bad;
  const [year, mon, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Day 0 of the next month is the last day of this one.
  if (day > new Date(Date.UTC(year, mon, 0)).getUTCDate()) throw bad;
  return `${FULL_MONTHS[mon - 1]} ${day}, ${year}`;
}

export const HEADINGS = {
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  volunteer: "Volunteer Experience",
} as const;

export type JobView = {
  title: string;
  org: string;
  location: string;
  dates: string;
  lines: string[];
};

const jobView = (j: ResumeJob): JobView => ({
  title: j.title,
  org: j.org,
  location: j.location,
  dates: formatDates(j.start, j.end),
  lines: [...j.lines],
});

const contactView = (c: ResumeContact) => ({
  name: c.name,
  details: [c.city, c.email, c.phone].filter((s): s is string => Boolean(s)),
  links: [...c.links],
});

// Picks every field by name, so a stray property on a model (an Entry ID, say) never
// reaches a template, even when a caller bypasses the types.
export function viewOf(m: ResumeModel) {
  return {
    title: m.title,
    ...contactView(m.contact),
    experience: m.experience.map(jobView),
    projects: m.projects.map((p) => ({ name: p.name, links: [...p.links] })),
    education: m.education.map((e) => ({
      school: e.school,
      program: e.program,
      dates: formatDates(e.start, e.end),
    })),
    skills: [...m.skills],
    volunteer: m.volunteer.map(jobView),
  };
}

export type ResumeView = ReturnType<typeof viewOf>;

// Picks by name for the same reason as `viewOf`: `sources`, `rules` and Do-not-claims cannot print.
export function letterViewOf(m: LetterModel) {
  return {
    title: m.title,
    ...contactView(m.contact),
    date: formatLetterDate(m.date),
    company: m.company,
    greeting: m.greeting,
    paragraphs: [...m.paragraphs],
    signOff: m.signOff,
  };
}

export type LetterView = ReturnType<typeof letterViewOf>;

import type { ResumeJob, ResumeModel } from "./model";

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

// Picks every field by name, so a stray property on a model (an Entry ID, say) never
// reaches a template, even when a caller bypasses the types.
export function viewOf(m: ResumeModel) {
  return {
    title: m.title,
    name: m.contact.name,
    details: [m.contact.city, m.contact.email, m.contact.phone].filter(
      (s): s is string => Boolean(s),
    ),
    links: [...m.contact.links],
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

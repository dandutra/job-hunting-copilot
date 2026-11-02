export const JOB_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "jobspy-linkedin",
  "jobspy-indeed",
  "adzuna",
  "alert-linkedin",
  "alert-indeed",
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export type DescriptionKind = "full" | "snippet" | "none";

export interface SightingDraft {
  jobSource: JobSource;
  listingKey: string;
  url: string;
  reportedAt: Date;
  companyName: string;
  title: string;
  location: string;
  description: string;
  descriptionKind: DescriptionKind;
  directUrl?: string;
  watchedCompanyId?: number;
}

// Lower wins: Watched company board, then JobSpy, then Adzuna, then alert emails.
const PRECEDENCE: Record<JobSource, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  smartrecruiters: 0,
  workday: 0,
  "jobspy-linkedin": 1,
  "jobspy-indeed": 1,
  adzuna: 2,
  "alert-linkedin": 3,
  "alert-indeed": 3,
};

export function precedenceOf(jobSource: string): number {
  return PRECEDENCE[jobSource as JobSource] ?? Number.MAX_SAFE_INTEGER;
}

const KIND_RANK: Record<DescriptionKind, number> = {
  none: 0,
  snippet: 1,
  full: 2,
};

export function kindRank(kind: string): number {
  return KIND_RANK[kind as DescriptionKind] ?? 0;
}

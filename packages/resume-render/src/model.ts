// The renderers' whole input. A field that is not here cannot print, so Entry IDs, `repo`,
// `sources`, `rules` and Do-not-claims stay out of the type on purpose.

export type ResumeContact = {
  name: string;
  city: string;
  email: string;
  // Written as 416-555-0100, the form the Master profile enforces.
  phone?: string;
  links: string[];
};

// Dates are YYYY-MM or YYYY-MM-DD. Both renderers format them through one function.
export type ResumeJob = {
  title: string;
  org: string;
  location: string;
  start: string;
  end?: string;
  lines: string[];
};

export type ResumeProject = { name: string; links: string[] };

export type ResumeEducation = {
  school: string;
  program: string;
  start: string;
  end?: string;
};

export type ResumeModel = {
  // The document title in both files' metadata.
  title: string;
  contact: ResumeContact;
  experience: ResumeJob[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  skills: string[];
  // Experience of type volunteer, printed under its own last heading.
  volunteer: ResumeJob[];
};

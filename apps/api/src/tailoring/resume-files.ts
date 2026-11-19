import { Injectable } from "@nestjs/common";
import type { DraftSection, Profile, TailoredDraft } from "master-profile";
import {
  type LetterModel,
  type ResumeJob,
  type ResumeModel,
  renderDocx,
  renderLetterDocx,
  renderLetterPdf,
  renderPdf,
} from "resume-render";

export type FileName =
  "resume.pdf" | "resume.docx" | "cover-letter.pdf" | "cover-letter.docx";

export type RenderedFile = {
  name: FileName;
  filename: string;
  content: Buffer;
};

type StoredDraft = Omit<TailoredDraft, "postingText">;

// The renderer's models carry no Entry IDs, so building them field by field is what strips the IDs.
export function resumeModel(profile: Profile, draft: StoredDraft): ResumeModel {
  const job = (
    section: DraftSection,
  ): { volunteer: boolean; job: ResumeJob } | null => {
    const e = profile.experiences.find((x) => x.id === section.id);
    if (!e) return null;
    // The API fills a fixed Experience from the profile: its live Facts that may appear on a resume.
    const lines = e.fixed
      ? profile.facts
          .filter(
            (f) => f.parent === e.id && !f.retired && f.use.includes("resume"),
          )
          .map((f) => f.text)
      : section.bullets.map((b) => b.text);
    return {
      volunteer: e.type === "volunteer",
      job: {
        title: e.titles.join(" / "),
        org: e.employer,
        location: e.location,
        start: e.start,
        end: e.end,
        lines,
      },
    };
  };
  const jobs = draft.experiences.flatMap((s) => job(s) ?? []);
  const { contact } = profile;
  return {
    title: `${contact.name} - Resume`,
    contact: {
      name: contact.name,
      city: contact.city,
      email: contact.email,
      phone: contact.phone,
      links: contact.links,
    },
    highlights: draft.summary.map((l) => l.text),
    experience: jobs.filter((j) => !j.volunteer).map((j) => j.job),
    volunteer: jobs.filter((j) => j.volunteer).map((j) => j.job),
    projects: draft.projects.flatMap((s) => {
      const p = profile.projects.find((x) => x.id === s.id);
      return p ? [{ name: p.name, links: p.links }] : [];
    }),
    education: draft.educationIds.flatMap((id) => {
      const d = profile.education.find((x) => x.id === id);
      return d
        ? [{ school: d.school, program: d.program, start: d.start, end: d.end }]
        : [];
    }),
    skills: draft.skills.map((s) => s.text),
  };
}

export function letterModel(
  profile: Profile,
  draft: StoredDraft,
  company: string,
  date: string,
): LetterModel | null {
  if (!draft.coverLetter) return null;
  const { contact } = profile;
  return {
    title: `${contact.name} - Cover letter`,
    contact: {
      name: contact.name,
      city: contact.city,
      email: contact.email,
      phone: contact.phone,
      links: contact.links,
    },
    date,
    company,
    greeting: `Dear ${company} hiring team,`,
    paragraphs: draft.coverLetter.map((p) => p.text),
    signOff: "Sincerely,",
  };
}

// The date the letter bears is the user's, in Toronto, not the server's UTC day.
export function today(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

// Characters a file name may not hold on a common file system.
const safe = (name: string) => name.replace(/[\\/:*?"<>|\r\n]/g, "").trim();

// A provider of its own so a test can make the render fail.
@Injectable()
export class ResumeFiles {
  // One file at a time: each PDF starts a Typst process, and the Droplet is small.
  async render(
    profile: Profile,
    draft: StoredDraft,
    company: string,
  ): Promise<RenderedFile[]> {
    const person = safe(profile.contact.name);
    const out: RenderedFile[] = [];
    const resume = resumeModel(profile, draft);
    out.push(
      {
        name: "resume.pdf",
        filename: `${person} - Resume.pdf`,
        content: await renderPdf(resume),
      },
      {
        name: "resume.docx",
        filename: `${person} - Resume.docx`,
        content: await renderDocx(resume),
      },
    );
    const letter = letterModel(profile, draft, company, today());
    if (letter)
      out.push(
        {
          name: "cover-letter.pdf",
          filename: `${person} - Cover Letter.pdf`,
          content: await renderLetterPdf(letter),
        },
        {
          name: "cover-letter.docx",
          filename: `${person} - Cover Letter.docx`,
          content: await renderLetterDocx(letter),
        },
      );
    return out;
  }
}

import type { Profile, TailoredDraft } from "master-profile";
import { letterModel, resumeModel, today } from "./resume-files";

const base = {
  contact: {
    name: "Sam Sample",
    city: "Exampleton",
    email: "s@example.com",
    links: [],
  },
  projects: [],
  education: [],
  skills: [],
  do_not_claims: [],
} as unknown as Profile;

const exp = (id: string, over: object) => ({
  id,
  employer: `Employer ${id}`,
  titles: ["Developer", "Lead"],
  start: "2022-01",
  location: "Exampleton",
  type: "employment",
  fixed: false,
  retired: false,
  ...over,
});
const fact = (id: string, parent: string, over: object = {}) => ({
  id,
  parent,
  text: `Fact ${id}`,
  tags: ["general"],
  ownership: "solo",
  sources: ["user"],
  use: ["resume", "cover-letter"],
  related: [],
  retired: false,
  ...over,
});

const profile = {
  ...base,
  experiences: [
    exp("E1", {}),
    exp("E2", { fixed: true }),
    exp("E3", { type: "volunteer", end: "2021-12" }),
  ],
  facts: [
    fact("F1", "E2"),
    fact("F2", "E2", { retired: true }),
    fact("F3", "E2", { use: ["interview"] }),
    fact("F4", "E1"),
  ],
} as unknown as Profile;

const line = (text: string) => ({ text, cites: ["F4"] });
const draft = {
  summary: [line("Highlight one."), line("Highlight two.")],
  experiences: [
    { id: "E1", bullets: [line("Reworded bullet.")] },
    { id: "E2", bullets: [] },
    { id: "E3", bullets: [line("Helped out.")] },
  ],
  projects: [],
  educationIds: [],
  skills: [],
} as unknown as Omit<TailoredDraft, "postingText">;

describe("resumeModel", () => {
  const model = resumeModel(profile, draft);

  it("fills a fixed Experience with its live Facts that a resume may use", () => {
    expect(model.experience[1].lines).toEqual(["Fact F1"]);
  });

  it("prints the draft's bullets for any other Experience, with every title", () => {
    expect(model.experience[0]).toMatchObject({
      title: "Developer / Lead",
      org: "Employer E1",
      lines: ["Reworded bullet."],
    });
  });

  it("puts a volunteer Experience in its own list and keeps the Highlights", () => {
    expect(model.experience.map((j) => j.org)).toEqual([
      "Employer E1",
      "Employer E2",
    ]);
    expect(model.volunteer.map((j) => j.org)).toEqual(["Employer E3"]);
    expect(model.highlights).toEqual(["Highlight one.", "Highlight two."]);
  });

  it("carries no Entry ID", () => {
    const json = JSON.stringify(model);
    expect(json).not.toContain('"id"');
    expect(json).not.toContain('"cites"');
  });
});

describe("letterModel", () => {
  it("is null for a draft with no cover letter", () => {
    expect(letterModel(profile, draft, "Acme", "2026-11-19")).toBeNull();
  });
});

describe("today", () => {
  it("is the Toronto date, not the UTC one, late in the evening there", () => {
    // 01:30 UTC on the 20th is 20:30 on the 19th in Toronto (EST).
    expect(today(new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-19");
  });
  it("is the same day just after midnight in Toronto", () => {
    expect(today(new Date("2026-11-20T05:30:00Z"))).toBe("2026-11-20");
  });
});

import { z } from "zod";

export const ROLE_FAMILIES = [
  "full-stack",
  "back-end",
  "front-end",
  "cloud/ops",
  "support",
] as const;
export const TAGS = [...ROLE_FAMILIES, "general", "leadership"] as const;
export const OWNERSHIPS = ["solo", "paired", "team", "maintained"] as const;
export const SURFACES = ["resume", "cover-letter", "interview"] as const;

const idOf = (letter: string) =>
  z
    .string()
    .regex(new RegExp(`^${letter}[1-9][0-9]*$`), `must look like ${letter}12`);
const anyId = z.string().regex(/^[EFPDSX][1-9][0-9]*$/, "must look like F12");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "must be YYYY-MM or YYYY-MM-DD");
const text = z.string().trim().min(1);

export const ExperienceSchema = z.strictObject({
  id: idOf("E"),
  employer: text,
  titles: z.array(text).min(1),
  start: date,
  end: date.optional(),
  location: text,
  type: z.enum(["employment", "volunteer"]),
  fixed: z.boolean().default(false),
  retired: z.boolean().default(false),
});

export const FactSchema = z.strictObject({
  id: idOf("F"),
  parent: anyId,
  text,
  tags: z.array(z.enum(TAGS)).min(1),
  ownership: z.enum(OWNERSHIPS),
  ownership_note: text.optional(),
  sources: z.array(text).min(1),
  use: z.array(z.enum(SURFACES)).min(1).default(["resume", "cover-letter"]),
  related: z.array(anyId).default([]),
  retired: z.boolean().default(false),
});

export const ProjectSchema = z.strictObject({
  id: idOf("P"),
  name: text,
  links: z.array(z.url()).default([]),
  repo: text.optional(),
  retired: z.boolean().default(false),
});

export const EducationSchema = z.strictObject({
  id: idOf("D"),
  school: text,
  program: text,
  start: date,
  end: date.optional(),
  retired: z.boolean().default(false),
});

export const SkillSchema = z.strictObject({
  id: idOf("S"),
  name: text,
  aliases: z.array(text).default([]),
  evidence: z.array(anyId).min(1, "a Skill needs at least one evidence Fact"),
  retired: z.boolean().default(false),
});

export const DoNotClaimSchema = z.strictObject({
  id: idOf("X"),
  text,
});

export const ProfileSchema = z.strictObject({
  sources: z.array(text).default([]),
  contact: z.strictObject({
    name: text,
    city: text,
    email: z.email(),
    links: z.array(z.url()).default([]),
  }),
  rules: z.array(text).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  facts: z.array(FactSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  do_not_claims: z.array(DoNotClaimSchema).default([]),
});

export type Profile = z.infer<typeof ProfileSchema>;

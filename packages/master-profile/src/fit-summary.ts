import type { Profile } from "./schema";

/** The only profile text sent to Jev: Skill names and resume Fact text. */
export function fitSummary(profile: Profile): string {
  const skills = profile.skills.filter((s) => !s.retired).map((s) => s.name);
  const facts = profile.facts
    .filter((f) => !f.retired && f.use.includes("resume"))
    .map((f) => `- ${f.text}`);
  return [`Skills: ${skills.join(", ")}`, "", "Facts:", ...facts].join("\n");
}

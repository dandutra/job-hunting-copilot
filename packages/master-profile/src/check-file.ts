import { existsSync, readFileSync } from "node:fs";
import type { Profile } from "./schema";
import { validateProfile } from "./validate";

export interface CheckResult {
  ok: boolean;
  output: string;
}

const KINDS: [keyof Profile, string][] = [
  ["experiences", "Experience"],
  ["facts", "Fact"],
  ["projects", "Project"],
  ["education", "Education"],
  ["skills", "Skill"],
  ["do_not_claims", "Do-not-claim"],
];

export function checkProfileFile(path: string): CheckResult {
  if (!existsSync(path))
    return { ok: false, output: `File not found: ${path}` };
  const result = validateProfile(readFileSync(path, "utf8"));
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.id}: ${e.message}`);
    return { ok: false, output: [`${path} is invalid:`, ...lines].join("\n") };
  }
  const counts = KINDS.map(
    ([key, label]) =>
      [label, (result.profile[key] as unknown[]).length] as const,
  );
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  const summary = counts.map(([label, n]) => `${n} ${label}`).join(", ");
  if (total === 0)
    return { ok: false, output: `${path} has 0 Entries (${summary})` };
  return { ok: true, output: `${path} is valid: ${summary}` };
}

import { parse } from "yaml";
import { ProfileSchema, type Profile } from "./schema";

export interface ProfileError {
  /** Entry ID, or "(file)" for an error that belongs to no Entry. */
  id: string;
  message: string;
}

export type ValidationResult =
  { ok: true; profile: Profile } | { ok: false; errors: ProfileError[] };

const FILE = "(file)";

function entryIdAt(raw: unknown, path: PropertyKey[]): string {
  const [section, index] = path;
  if (typeof section === "string" && typeof index === "number") {
    const entry = (raw as Record<string, unknown> | null)?.[section];
    const id = (Array.isArray(entry) ? entry[index] : undefined)?.id;
    if (typeof id === "string") return id;
    return `${section}[${index}]`;
  }
  return FILE;
}

function valueAt(raw: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      (node as Record<PropertyKey, unknown> | null | undefined)?.[key],
    raw,
  );
}

function schemaErrors(
  raw: unknown,
  issues: { path: PropertyKey[]; message: string }[],
) {
  return issues.map(({ path, message }) => {
    const got = valueAt(raw, path);
    const shown = typeof got === "string" ? ` (got "${got}")` : "";
    return {
      id: entryIdAt(raw, path),
      message: path.length ? `${path.join(".")}: ${message}${shown}` : message,
    };
  });
}

function crossChecks(profile: Profile): ProfileError[] {
  const errors: ProfileError[] = [];
  const add = (id: string, message: string) => errors.push({ id, message });

  const retired = new Set<string>();
  const live = new Set<string>();
  const doNotClaims = new Set(profile.do_not_claims.map((x) => x.id));
  const seen = new Set<string>();
  const entries = [
    ...profile.experiences,
    ...profile.facts,
    ...profile.projects,
    ...profile.education,
    ...profile.skills,
    ...profile.do_not_claims,
  ];
  for (const entry of entries) {
    if (seen.has(entry.id)) add(entry.id, `duplicate ID ${entry.id}`);
    seen.add(entry.id);
    if ("retired" in entry && entry.retired) retired.add(entry.id);
    else live.add(entry.id);
  }

  // Returns true when the reference is usable; reports the reason when not.
  const resolve = (owner: string, ref: string, role: string, kinds: string) => {
    if (doNotClaims.has(ref)) {
      add(owner, `${role} ${ref} is a Do-not-claim, which is never cited`);
    } else if (!seen.has(ref)) {
      add(owner, `${role} ${ref} is an unknown ID`);
    } else if (!kinds.includes(ref[0])) {
      add(
        owner,
        `${role} ${ref} must be one of kinds ${kinds.split("").join(", ")}`,
      );
    } else return true;
    return false;
  };
  const noRetired = (owner: string, ref: string, role: string) => {
    if (retired.has(ref)) add(owner, `${role} ${ref} is retired`);
  };

  const sources = new Set(profile.sources);
  for (const fact of profile.facts) {
    for (const source of fact.sources) {
      if (!sources.has(source)) {
        add(fact.id, `source "${source}" is not in the top-level sources list`);
      }
    }
    const refs: [string, string, string][] = [
      [fact.parent, "parent", "EPD"],
      ...fact.related.map((r): [string, string, string] => [r, "related", "F"]),
    ];
    for (const [ref, role, kinds] of refs) {
      if (resolve(fact.id, ref, role, kinds) && !fact.retired) {
        noRetired(fact.id, ref, role);
      }
    }
  }
  for (const skill of profile.skills) {
    for (const ref of skill.evidence) {
      if (resolve(skill.id, ref, "evidence", "F") && !skill.retired) {
        noRetired(skill.id, ref, "evidence");
      }
    }
  }
  return errors;
}

export function validateProfile(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        { id: FILE, message: `not valid YAML: ${(error as Error).message}` },
      ],
    };
  }
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: schemaErrors(raw, parsed.error.issues) };
  }
  const errors = crossChecks(parsed.data);
  return errors.length
    ? { ok: false, errors }
    : { ok: true, profile: parsed.data };
}

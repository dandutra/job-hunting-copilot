import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "apps/api/openapi.json",
  "apps/jobspy/openapi.json",
  "apps/web/src/api/schema.d.ts",
  "apps/api/src/ingestion/jobspy/schema.d.ts",
];

const read = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
};

const before = Object.fromEntries(files.map((f) => [f, read(f)]));
execSync("pnpm generate", { stdio: "inherit" });
const stale = files.filter((f) => read(f) !== before[f]);

// Put the committed content back so the check never edits the tree.
for (const f of stale) {
  if (before[f] !== null) writeFileSync(f, before[f]);
}

if (stale.length > 0) {
  console.error(`Generated files are stale: ${stale.join(", ")}. Run pnpm generate and commit the result.`);
  process.exit(1);
}
console.log(`Generated files are current (${files.length} checked).`);

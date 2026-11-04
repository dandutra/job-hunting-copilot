import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GENERATED_FILES = [
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

// Returns the files that `generate` changed, then puts every file back as it was,
// even when `generate` throws partway, so the check never edits the tree.
export function findStale(files, generate) {
  const before = new Map(files.map((f) => [f, read(f)]));
  try {
    generate();
    return files.filter((f) => read(f) !== before.get(f));
  } finally {
    for (const [f, content] of before) {
      if (read(f) === content) continue;
      if (content === null) rmSync(f, { force: true });
      else writeFileSync(f, content);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stale = findStale(GENERATED_FILES, () =>
    execSync("pnpm generate", { stdio: "inherit" }),
  );
  if (stale.length > 0) {
    console.error(
      `Generated files are stale: ${stale.join(", ")}. Run pnpm generate and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`Generated files are current (${GENERATED_FILES.length} checked).`);
}

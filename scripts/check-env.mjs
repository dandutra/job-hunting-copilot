// Compares env var names along the deploy path, because #35, #37 and #38 each shipped a name
// that reached the code but not production. Run from the repo root; exits 1 on any problem.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Read only on the Mac or by `pnpm dev`, so no Compose file or deploy step uses them.
const HOST_ONLY = [
  "DATABASE_URL", // pnpm dev and Prisma; production Compose builds its own
  "API_PORT",
  "JOBSPY_URL", // pnpm dev; production Compose sets its own
  "VITE_API_URL",
  "COPILOT_API_URL", // pnpm profile:import and /tailor
  "RESTORE_KEY_ID", // deploy/restore-drill.sh on the Mac
  "RESTORE_KEY",
  "RESTORE_AGE_IDENTITY_FILE",
];
// deploy.sh sets IMAGE_TAG from its argument, and Compose defaults the other two.
const NOT_WRITTEN = new Set(["IMAGE_TAG", "POSTGRES_USER", "POSTGRES_DB"]);

const NAME = "[A-Z][A-Z0-9_]*";

export const envExampleNames = (text) =>
  new Set([...text.matchAll(new RegExp(`^(${NAME})=`, "gm"))].map((m) => m[1]));

// `$${X}` is Compose's escape for a variable the container's shell reads, not an interpolation.
export const composeReads = (text) =>
  new Set([...text.matchAll(new RegExp(`(?<!\\$)\\$\\{(${NAME})`, "g"))].map((m) => m[1]));

export function deployStepWrites(text) {
  const step = text.match(/^( *)- name: Deploy\n([\s\S]*?)(?=^\1- |(?![\s\S]))/m);
  if (!step) return { env: new Set(), printf: new Set() };
  const env = step[2].match(/^ +env:\n((?: {10,}.*\n)+)/m)?.[1] ?? "";
  return {
    env: new Set([...env.matchAll(new RegExp(`^ +(${NAME}):`, "gm"))].map((m) => m[1])),
    printf: new Set([...step[2].matchAll(new RegExp(`"(${NAME})=\\$\\{`, "g"))].map((m) => m[1])),
  };
}

export const shellArray = (text, name) =>
  new Set(text.match(new RegExp(`^${name}=\\(([^)]*)\\)`, "m"))?.[1].trim().split(/\s+/) ?? []);

export function findProblems(s) {
  const problems = [];
  const written = new Set([...s.deployPrintf].filter((n) => s.deployEnv.has(n)));
  const used = new Set([...s.localCompose, ...s.prodCompose, ...s.deployEnv, ...s.deployPrintf]);

  for (const n of new Set([...s.deployEnv, ...s.deployPrintf]))
    if (!written.has(n))
      problems.push(
        s.deployEnv.has(n)
          ? `${n} is in the Deploy step's env but not its printf list, so it never reaches .env`
          : `${n} is in the Deploy step's printf list but not its env, so it is written empty`,
      );
  for (const n of used)
    if (!s.envExample.has(n) && !NOT_WRITTEN.has(n)) problems.push(`${n} is used but missing from .env.example`);
  for (const n of written)
    if (!s.prodCompose.has(n) && !s.backupVars.has(n))
      problems.push(`${n} is written by the Deploy step but read by neither deploy/compose.prod.yaml nor backup.sh`);
  for (const n of s.prodCompose)
    if (!written.has(n) && !NOT_WRITTEN.has(n))
      problems.push(`${n} is read by deploy/compose.prod.yaml but the Deploy step never writes it`);
  for (const n of s.envExample)
    if (!used.has(n) && !s.hostOnly.has(n))
      problems.push(`${n} is in .env.example but nothing uses it and it is not host-only`);
  return problems;
}

function main() {
  const read = (f) => readFileSync(f, "utf8");
  const deploy = deployStepWrites(read(".github/workflows/deploy.yml"));
  const sources = {
    envExample: envExampleNames(read(".env.example")),
    localCompose: composeReads(read("compose.yaml")),
    prodCompose: composeReads(read("deploy/compose.prod.yaml")),
    deployEnv: deploy.env,
    deployPrintf: deploy.printf,
    backupVars: shellArray(read("deploy/deploy.sh"), "backup_vars"),
    hostOnly: new Set(HOST_ONLY),
  };

  const counts = Object.entries(sources).map(([k, v]) => `${k}=${v.size}`).join(" ");
  // An empty source means a parser stopped matching, which would make every rule pass.
  const empty = Object.entries(sources).filter(([, v]) => v.size === 0).map(([k]) => k);
  const problems = [...empty.map((k) => `${k} parsed to 0 names`), ...findProblems(sources)];

  for (const p of problems) console.error(`FAIL: ${p}`);
  console.log(`env names: ${counts} problems=${problems.length}`);
  if (problems.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

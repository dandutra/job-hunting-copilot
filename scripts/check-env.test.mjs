import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeReads,
  deployStepWrites,
  envExampleNames,
  findProblems,
  shellArray,
} from "./check-env.mjs";

const deployYml = `
jobs:
  deploy:
    steps:
      - name: Check the SHA
        run: echo "$TARGET_SHA"
      - name: Deploy
        env:
          POSTGRES_PASSWORD: \${{ secrets.POSTGRES_PASSWORD }}
          JOBSPY_PROXIES: \${{ secrets.JOBSPY_PROXIES }}
        run: |
          printf '%s\\n' \\
            "POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}" \\
            "JOBSPY_PROXIES=\${JOBSPY_PROXIES}" \\
            | tailscale ssh deploy@copilot "./deploy/deploy.sh \${TARGET_SHA}"
`;

test("reads names from each source", () => {
  assert.deepEqual(envExampleNames("# c\nA=1\nB=\n\nC=x=y\n"), new Set(["A", "B", "C"]));
  assert.deepEqual(
    composeReads('X: ${A:-1}\nY: ${B:?set}\ntest: "pg_isready -U $${C}"\n'),
    new Set(["A", "B"]),
  );
  assert.deepEqual(deployStepWrites(deployYml), {
    env: new Set(["POSTGRES_PASSWORD", "JOBSPY_PROXIES"]),
    printf: new Set(["POSTGRES_PASSWORD", "JOBSPY_PROXIES"]),
  });
  assert.deepEqual(shellArray("x=1\nbackup_vars=(K1 K2)\n", "backup_vars"), new Set(["K1", "K2"]));
});

const ok = () => ({
  envExample: new Set(["POSTGRES_PASSWORD", "POSTGRES_PORT", "JOBSPY_PROXIES", "IMAGE_TAG", "BACKUP_KEY", "VITE_API_URL"]),
  localCompose: new Set(["POSTGRES_PASSWORD", "POSTGRES_PORT"]),
  prodCompose: new Set(["POSTGRES_PASSWORD", "JOBSPY_PROXIES", "IMAGE_TAG", "POSTGRES_USER"]),
  deployEnv: new Set(["POSTGRES_PASSWORD", "JOBSPY_PROXIES", "BACKUP_KEY"]),
  deployPrintf: new Set(["POSTGRES_PASSWORD", "JOBSPY_PROXIES", "BACKUP_KEY"]),
  backupVars: new Set(["BACKUP_KEY"]),
  hostOnly: new Set(["VITE_API_URL"]),
});

test("passes when every name reaches every place", () => {
  assert.deepEqual(findProblems(ok()), []);
});

test("names each broken rule", () => {
  const s = ok();
  s.prodCompose.delete("JOBSPY_PROXIES");
  s.localCompose.delete("POSTGRES_PORT");
  s.localCompose.add("NEW_VAR");
  s.prodCompose.add("TYPESAFE_API_KEY");
  s.envExample.add("TYPESAFE_API_KEY");
  s.deployEnv.add("HEARTBEAT_URL");
  s.envExample.add("HEARTBEAT_URL");
  assert.deepEqual(findProblems(s).sort(), [
    "HEARTBEAT_URL is in the Deploy step's env but not its printf list, so it never reaches .env",
    "JOBSPY_PROXIES is written by the Deploy step but read by neither deploy/compose.prod.yaml nor backup.sh",
    "NEW_VAR is used but missing from .env.example",
    "POSTGRES_PORT is in .env.example but nothing uses it and it is not host-only",
    "TYPESAFE_API_KEY is read by deploy/compose.prod.yaml but the Deploy step never writes it",
  ]);
});

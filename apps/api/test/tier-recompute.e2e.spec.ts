import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.service";
import { CAP_NAMES, QUESTION_SET_VERSION } from "../src/jev/question-set";
import { openTestDb, resetTestDb, testDatabaseUrl } from "./test-db";

function answers(score: number) {
  const a: Record<string, unknown> = {
    skills_covered: { type: "score", score },
    level_match: { type: "score", score },
    role_family: { type: "choice", choice: "other" },
    work_arrangement: { type: "choice", choice: "not_stated" },
  };
  for (const n of CAP_NAMES) a[n] = { type: "noul", noul: 0 };
  return a;
}

describe("pnpm tier:recompute", () => {
  let prisma: PrismaService;
  let dir: string;
  let config: string;

  beforeAll(async () => {
    prisma = await openTestDb();
    dir = mkdtempSync(join(tmpdir(), "tier-"));
    config = join(dir, "tier-config.json");
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    copyFileSync("../../config/tier-config.json", config);
  });

  const run = (...args: string[]) =>
    spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/tier-recompute.ts", "--config", config, ...args],
      {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
      },
    );

  it("exits non-zero and prints its counts when there is nothing to process", () => {
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("found=0 processed=0 skipped=0 failed=0");
  });

  it("seeds thresholds by rank, rewrites the config and recomputes", async () => {
    const company = await prisma.company.create({ data: { name: "Acme" } });
    const profile = createHash("sha256").update("p").digest("hex");
    await prisma.masterProfileVersion.create({
      data: { id: profile, rawYaml: "x" },
    });
    for (let i = 0; i < 10; i++) {
      const p = await prisma.posting.create({
        data: {
          companyId: company.id,
          title: `Dev ${i}`,
          location: "Toronto",
          description: "x",
          descriptionKind: "full",
          postedAt: new Date(),
        },
      });
      await prisma.jevJudgement.create({
        data: {
          postingId: p.id,
          profileVersionId: profile,
          questionSetVersion: QUESTION_SET_VERSION,
          descriptionKind: "full",
          model: "jev-1.14.0",
          answers: answers((i + 1) * 0.3) as object,
        },
      });
    }
    const r = run("--seed-thresholds");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("found=10 processed=10 skipped=0 failed=0");
    const written = JSON.parse(readFileSync(config, "utf8"));
    expect(written.thresholds.a).toBeGreaterThan(written.thresholds.b);
    const tiers = await prisma.postingTier.groupBy({
      by: ["tier"],
      _count: true,
    });
    const count = Object.fromEntries(tiers.map((t) => [t.tier, t._count]));
    expect(count).toEqual({ A: 1, B: 3, C: 6 });
  });
});

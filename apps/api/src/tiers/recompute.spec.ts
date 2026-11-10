import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { openTestDb, resetTestDb } from "../../test/test-db";
import { CAP_NAMES, QUESTION_SET_VERSION } from "../jev/question-set";
import { loadTierConfig } from "./tier-config";
import { recomputeTiers, thresholdsByRank, uncappedTotals } from "./recompute";

const CONFIG_JSON = JSON.stringify({
  scoreWeight: 0.5,
  rolePoints: {
    full_stack: 0.2,
    back_end: 0.1,
    front_end: 0.05,
    cloud_ops: 0.02,
    support: 0.01,
    other: 0,
  },
  workPoints: { hybrid: 0.1, remote: 0.05, on_site: 0 },
  capThresholds: {
    closed_to_juniors: 0.7,
    outside_gta: 0.5,
    us_only: 0.7,
    security_clearance: 0.7,
    requires_french: 0.7,
  },
  thresholds: { a: 0.9, b: 0.6 },
});

function answers(score: number, nouls: Record<string, number> = {}) {
  const a: Record<string, unknown> = {
    skills_covered: { type: "score", score },
    level_match: { type: "score", score },
    role_family: { type: "choice", choice: "other" },
    work_arrangement: { type: "choice", choice: "not_stated" },
  };
  for (const n of CAP_NAMES) a[n] = { type: "noul", noul: nouls[n] ?? 0 };
  return a;
}

describe("recomputeTiers", () => {
  let prisma: PrismaService;
  let companyId: number;
  let profileId: string;
  let seq = 0;
  const { config, version } = loadTierConfig(CONFIG_JSON);

  beforeAll(async () => {
    prisma = await openTestDb();
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    companyId = (await prisma.company.create({ data: { name: "Acme" } })).id;
    profileId = createHash("sha256")
      .update(String(Math.random()))
      .digest("hex");
    await prisma.masterProfileVersion.create({
      data: { id: profileId, rawYaml: "x" },
    });
  });

  async function posting(kind = "full") {
    seq++;
    return prisma.posting.create({
      data: {
        companyId,
        title: `Dev ${seq}`,
        location: "Toronto",
        description: "x",
        descriptionKind: kind,
        postedAt: new Date(),
      },
    });
  }
  async function judge(postingId: number, a: unknown, createdAt = new Date()) {
    return prisma.jevJudgement.create({
      data: {
        postingId,
        profileVersionId: profileId,
        questionSetVersion: QUESTION_SET_VERSION,
        descriptionKind: "full",
        model: "jev-1.14.0",
        answers: a as object,
        createdAt,
      },
    });
  }

  it("stores a Tier with the config version and the judgement it used", async () => {
    const p = await posting();
    const j = await judge(p.id, answers(3));
    const counts = await recomputeTiers(prisma, config, version);
    expect(counts).toEqual({ found: 1, processed: 1, skipped: 0, failed: 0 });
    const row = await prisma.postingTier.findUniqueOrThrow({
      where: { postingId: p.id },
    });
    expect(row).toMatchObject({
      tier: "A",
      configVersion: version,
      judgementId: j.id,
      capsApplied: [],
    });
  });

  it("holds a capped strong Posting at C, keeps its row and names the cap", async () => {
    const p = await posting();
    await judge(p.id, answers(3, { requires_french: 0.9 }));
    await recomputeTiers(prisma, config, version);
    const row = await prisma.postingTier.findUniqueOrThrow({
      where: { postingId: p.id },
    });
    expect(row.tier).toBe("C");
    expect(row.capsApplied).toEqual(["requires_french"]);
    expect(row.total).toBeGreaterThan(config.thresholds.a);
  });

  it("gives a Posting with no judgement no Tier row and counts it skipped", async () => {
    const p = await posting("none");
    const counts = await recomputeTiers(prisma, config, version);
    expect(counts).toEqual({ found: 1, processed: 0, skipped: 1, failed: 0 });
    expect(
      await prisma.postingTier.findUnique({ where: { postingId: p.id } }),
    ).toBeNull();
  });

  it("uses the newest judgement and moves the row to a new config version without a Jev call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const p = await posting();
    await judge(p.id, answers(0), new Date(Date.now() - 5000));
    const newest = await judge(p.id, answers(3));
    await recomputeTiers(prisma, config, version);
    const next = loadTierConfig(
      JSON.stringify({
        ...JSON.parse(CONFIG_JSON),
        thresholds: { a: 0.5, b: 0.2 },
      }),
    );
    await recomputeTiers(prisma, next.config, next.version);
    const rows = await prisma.postingTier.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      configVersion: next.version,
      judgementId: newest.id,
      tier: "A",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("counts an invalid stored answer as failed and still processes the rest", async () => {
    const bad = await posting();
    const good = await posting();
    await judge(bad.id, { skills_covered: {} });
    await judge(good.id, answers(3));
    const lines: string[] = [];
    const counts = await recomputeTiers(prisma, config, version, (l) =>
      lines.push(l),
    );
    expect(counts).toEqual({ found: 2, processed: 1, skipped: 0, failed: 1 });
    expect(lines).toHaveLength(1);
  });

  it("finds nothing to process on an empty database", async () => {
    expect(await recomputeTiers(prisma, config, version)).toEqual({
      found: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("totals only uncapped Postings for seeding", async () => {
    const a = await posting();
    const b = await posting();
    await judge(a.id, answers(3));
    await judge(b.id, answers(3, { us_only: 0.9 }));
    expect(await uncappedTotals(prisma, config)).toEqual([1]);
  });
});

describe("thresholdsByRank", () => {
  it("makes the top 10% A and the next 30% B", () => {
    const totals = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
    const { a, b } = thresholdsByRank(totals);
    expect(totals.filter((t) => t >= a)).toHaveLength(2);
    expect(totals.filter((t) => t >= b)).toHaveLength(8);
  });

  it("refuses an empty list and totals too alike to separate", () => {
    expect(() => thresholdsByRank([])).toThrow(/no judgements/);
    expect(() => thresholdsByRank([0.5, 0.5, 0.5])).toThrow(/too few/);
  });
});

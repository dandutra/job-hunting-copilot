import { createHash } from "node:crypto";
import { openTestDb, resetTestDb } from "../../test/test-db";
import { TierConfigSource } from "../feed/tier-config-source";
import { JevRunner } from "../jev/jev-runner";
import { CAP_NAMES, QUESTION_SET_VERSION } from "../jev/question-set";
import { PrismaService } from "../prisma/prisma.service";
import { loadTierConfig } from "../tiers/tier-config";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { JevPollHooks } from "./jev-poll-hooks";

const configJson = (a: number, b: number) =>
  JSON.stringify({
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
    thresholds: { a, b },
  });

class FixedSource extends TierConfigSource {
  constructor(private raw: string) {
    super();
  }
  set(raw: string) {
    this.raw = raw;
  }
  load() {
    return loadTierConfig(this.raw);
  }
}

class ThrowingSource extends TierConfigSource {
  load(): never {
    throw new Error("bad config");
  }
}

const jevStub = { run: async () => ({}) } as unknown as JevRunner;

describe("JevPollHooks tier recompute", () => {
  let prisma: PrismaService;
  let postingId: number;

  beforeAll(async () => {
    prisma = await openTestDb();
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    const company = await prisma.company.create({ data: { name: "Acme" } });
    const profileId = createHash("sha256").update("p").digest("hex");
    await prisma.masterProfileVersion.create({
      data: { id: profileId, rawYaml: "x" },
    });
    const posting = await prisma.posting.create({
      data: {
        companyId: company.id,
        title: "Developer",
        location: "Toronto",
        description: "x",
        descriptionKind: "full",
        postedAt: new Date(),
      },
    });
    postingId = posting.id;
    const answers: Record<string, unknown> = {
      skills_covered: { type: "score", score: 3 },
      level_match: { type: "score", score: 3 },
      role_family: { type: "choice", choice: "other" },
      work_arrangement: { type: "choice", choice: "not_stated" },
    };
    for (const n of CAP_NAMES) answers[n] = { type: "noul", noul: 0 };
    await prisma.jevJudgement.create({
      data: {
        postingId,
        profileVersionId: profileId,
        questionSetVersion: QUESTION_SET_VERSION,
        descriptionKind: "full",
        model: "jev-1.14.0",
        answers: answers as object,
      },
    });
  });

  const hooks = (source: TierConfigSource) =>
    new JevPollHooks(new HeartbeatPollHooks(""), jevStub, source, prisma);
  const tier = () => prisma.postingTier.findUnique({ where: { postingId } });

  it("gives a judged Posting a Tier after one pollFinished", async () => {
    await hooks(new FixedSource(configJson(0.9, 0.6))).pollFinished([]);
    expect((await tier())?.tier).toBe("A");
  });

  it("moves an existing Tier when the config changed", async () => {
    const source = new FixedSource(configJson(0.9, 0.6));
    const h = hooks(source);
    await h.pollFinished([]);
    source.set(configJson(1.5, 1.2));
    await h.pollFinished([]);
    expect((await tier())?.tier).toBe("C");
  });

  it("leaves Tiers as they were when the config fails to load", async () => {
    await hooks(new FixedSource(configJson(0.9, 0.6))).pollFinished([]);
    await expect(
      hooks(new ThrowingSource()).pollFinished([]),
    ).resolves.toBeUndefined();
    expect((await tier())?.tier).toBe("A");
  });

  it("writes no Tier when shouldStop is true", async () => {
    await hooks(new FixedSource(configJson(0.9, 0.6))).pollFinished(
      [],
      () => true,
    );
    expect(await tier()).toBeNull();
  });
});

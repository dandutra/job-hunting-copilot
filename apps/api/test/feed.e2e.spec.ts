import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { Clock } from "../src/labels/labels-env";
import { FeedModule } from "../src/feed/feed.module";
import { TierConfigSource } from "../src/feed/tier-config-source";
import { PrismaService } from "../src/prisma/prisma.service";
import { loadTierConfig } from "../src/tiers/tier-config";
import {
  CONFIG_VERSION,
  FakeClock,
  LOGIN,
  seedPosting,
} from "./label-fixtures";
import { openTestDb, resetTestDb } from "./test-db";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-01T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const { config } = loadTierConfig(
  JSON.stringify({
    scoreWeight: 0.6,
    rolePoints: {
      full_stack: 0.15,
      back_end: 0.1,
      front_end: 0.05,
      cloud_ops: 0.02,
      support: 0,
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
  }),
);

const answers = {
  skills_covered: { type: "score", score: 3 },
  level_match: { type: "score", score: 3 },
  role_family: { type: "choice", choice: "back_end" },
  work_arrangement: { type: "choice", choice: "hybrid" },
  closed_to_juniors: { type: "noul", noul: 0 },
  outside_gta: { type: "noul", noul: 0 },
  us_only: { type: "noul", noul: 0 },
  security_clearance: { type: "noul", noul: 0 },
  requires_french: { type: "noul", noul: 0 },
};

describe("feed endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock();
  const source = {
    version: CONFIG_VERSION,
    load: () => ({ config, version: source.version }),
  };

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, FeedModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(TierConfigSource)
      .useValue(source)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    clock.at = NOW;
    source.version = CONFIG_VERSION;
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set("Tailscale-User-Login", LOGIN);

  it("lists Postings grouped A, B, C and newest Posted at first within a Tier", async () => {
    const c = await seedPosting(prisma, { tier: "C", postedAt: daysAgo(1) });
    const bOld = await seedPosting(prisma, { tier: "B", postedAt: daysAgo(5) });
    const bNew = await seedPosting(prisma, { tier: "B", postedAt: daysAgo(2) });
    const aOld = await seedPosting(prisma, { tier: "A", postedAt: daysAgo(9) });
    const aNew = await seedPosting(prisma, { tier: "A", postedAt: daysAgo(3) });

    const res = await get("/postings");

    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([
      aNew,
      aOld,
      bNew,
      bOld,
      c,
    ]);
    expect(res.body.map((p: { tier: string }) => p.tier)).toEqual([
      "A",
      "A",
      "B",
      "B",
      "C",
    ]);
  });

  it("carries the fields the feed row shows", async () => {
    const id = await seedPosting(prisma, {
      tier: "C",
      caps: ["us_only"],
      kind: "snippet",
      company: "Acme",
      location: "Remote, Canada",
      title: "Dev",
      postedAt: daysAgo(4),
    });
    const sighting = await prisma.sighting.findFirstOrThrow({
      where: { postingId: id },
    });
    await prisma.sighting.create({
      data: {
        ...sighting,
        id: undefined,
        jobSource: "adzuna",
        listingKey: "z",
      },
    });

    const [row] = (await get("/postings")).body;

    expect(row).toEqual({
      id,
      tier: "C",
      title: "Dev",
      company: "Acme",
      location: "Remote, Canada",
      postedAt: daysAgo(4).toISOString(),
      sightingCount: 2,
      thin: true,
      capsApplied: ["us_only"],
      hasLookalike: false,
      feedCorrection: null,
      state: "open",
    });
  });

  it("flags a Posting with an open Lookalike", async () => {
    const a = await seedPosting(prisma, { tier: "A" });
    const b = await seedPosting(prisma, { tier: "B" });
    await prisma.lookalike.create({
      data: {
        lowPostingId: a,
        highPostingId: b,
        reason: "similar_title",
        evidence: {},
      },
    });

    const rows = (await get("/postings")).body;

    expect(rows.map((r: { hasLookalike: boolean }) => r.hasLookalike)).toEqual([
      true,
      true,
    ]);
  });

  it("returns the newest Feed correction, or null", async () => {
    const id = await seedPosting(prisma, { tier: "C" });
    const other = await seedPosting(prisma, { tier: "C" });
    await prisma.feedCorrection.create({
      data: { postingId: id, tier: "B", jevTier: "C", createdAt: daysAgo(2) },
    });
    await prisma.feedCorrection.create({
      data: { postingId: id, tier: "A", jevTier: "C", createdAt: daysAgo(1) },
    });

    const rows = (await get("/postings")).body;

    const by = (x: number) =>
      rows.find((r: { id: number }) => r.id === x).feedCorrection;
    expect(by(id)).toBe("A");
    expect(by(other)).toBeNull();
  });

  it("leaves out Closed and Stale Postings unless include=closed", async () => {
    const open = await seedPosting(prisma, { tier: "A" });
    const stale = await seedPosting(prisma, {
      tier: "A",
      firstSeenAt: daysAgo(60),
      lastSeenAt: daysAgo(40),
    });
    const company = await prisma.company.create({
      data: { name: "Board", ats: "greenhouse", boardSlug: "board" },
    });
    const closed = await seedPosting(prisma, {
      tier: "B",
      firstSeenAt: daysAgo(10),
      lastSeenAt: daysAgo(3),
      closedAt: daysAgo(2),
    });
    await prisma.sighting.updateMany({
      where: { postingId: closed },
      data: { watchedCompanyId: company.id },
    });

    const plain = (await get("/postings")).body;
    const all = (await get("/postings?include=closed")).body;

    expect(plain.map((p: { id: number }) => p.id)).toEqual([open]);
    expect(
      Object.fromEntries(
        all.map((p: { id: number; state: string }) => [p.id, p.state]),
      ),
    ).toEqual({ [open]: "open", [stale]: "stale", [closed]: "closed" });
  });

  it("rejects an unknown include value", async () => {
    expect((await get("/postings?include=everything")).status).toBe(400);
  });

  it("leaves out a Posting that has no Tier yet", async () => {
    const id = await seedPosting(prisma, { tier: "A" });
    await prisma.postingTier.deleteMany({ where: { postingId: id } });

    expect((await get("/postings")).body).toEqual([]);
  });

  describe("detail", () => {
    it("adds Work arrangement, Role family, the points and the description", async () => {
      const id = await seedPosting(prisma, {
        tier: "A",
        caps: [],
        answers,
        title: "Backend dev",
      });

      const res = await get(`/postings/${id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id,
        tier: "A",
        title: "Backend dev",
        description: (await prisma.posting.findUniqueOrThrow({ where: { id } }))
          .description,
        descriptionKind: "full",
        workArrangement: "hybrid",
        roleFamily: "back_end",
        lookalikes: [],
        state: "open",
      });
      expect(res.body.why.thresholds).toEqual({ a: 0.9, b: 0.6 });
      expect(
        res.body.why.factors.map((f: { factor: string }) => f.factor),
      ).toEqual([
        "skills_covered",
        "level_match",
        "role_family",
        "work_arrangement",
      ]);
      expect(res.body.why.total).toBeCloseTo(1.2);
      expect(res.body.why.stale).toBe(false);
    });

    it("marks the points stale when the config changed since the Tier was computed", async () => {
      const id = await seedPosting(prisma, { tier: "A", answers });
      source.version = "cfg-2";

      const res = await get(`/postings/${id}`);

      expect(res.body.why.stale).toBe(true);
    });

    it("has no points when the stored answers no longer validate", async () => {
      const id = await seedPosting(prisma, { tier: "A" });

      const res = await get(`/postings/${id}`);

      expect(res.body.why).toBeNull();
      expect(res.body.workArrangement).toBeNull();
      expect(res.body.roleFamily).toBeNull();
    });

    it("returns two Sightings with one URL as one link with both Job sources", async () => {
      const id = await seedPosting(prisma, { tier: "B" });
      const first = await prisma.sighting.findFirstOrThrow({
        where: { postingId: id },
      });
      await prisma.sighting.create({
        data: {
          ...first,
          id: undefined,
          jobSource: "adzuna",
          listingKey: "adzuna:1",
        },
      });
      await prisma.sighting.create({
        data: {
          ...first,
          id: undefined,
          jobSource: "alert-linkedin",
          listingKey: "alert:1",
          url: "https://mail.example.com/x",
        },
      });

      const { links } = (await get(`/postings/${id}`)).body;

      expect(links).toEqual([
        { url: first.url, jobSources: ["greenhouse", "adzuna"] },
        { url: "https://mail.example.com/x", jobSources: ["alert-linkedin"] },
      ]);
    });

    it("names the other Posting of a Lookalike and why", async () => {
      const a = await seedPosting(prisma, { tier: "A" });
      const b = await seedPosting(prisma, {
        tier: "B",
        title: "Twin",
        company: "Twin Co",
      });
      const row = await prisma.lookalike.create({
        data: {
          lowPostingId: a,
          highPostingId: b,
          reason: "same_title",
          evidence: {},
        },
      });

      const fromA = (await get(`/postings/${a}`)).body.lookalikes;
      const fromB = (await get(`/postings/${b}`)).body.lookalikes;

      expect(fromA).toEqual([
        {
          id: row.id,
          reason: "same_title",
          other: expect.objectContaining({
            id: b,
            title: "Twin",
            company: "Twin Co",
            tier: "B",
          }),
        },
      ]);
      expect(fromB[0].other.id).toBe(a);
    });

    it("answers for a Closed or Stale Posting with its state", async () => {
      const id = await seedPosting(prisma, {
        tier: "A",
        firstSeenAt: daysAgo(60),
        lastSeenAt: daysAgo(40),
      });

      const res = await get(`/postings/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe("stale");
    });

    it("answers 404 for an unknown Posting and 400 for a bad id", async () => {
      expect((await get("/postings/99999")).status).toBe(404);
      expect((await get("/postings/abc")).status).toBe(400);
    });

    it("returns a null Tier for a Posting with none", async () => {
      const id = await seedPosting(prisma, { tier: "A" });
      await prisma.postingTier.deleteMany({ where: { postingId: id } });

      const res = await get(`/postings/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.tier).toBeNull();
    });
  });
});

import { Test } from "@nestjs/testing";
import { openTestDb, resetTestDb, testDatabaseUrl } from "../../test/test-db";
import { CompaniesService } from "../companies/companies.service";
import { MatchingHooks } from "../matching/matching-hooks";
import { SightingDraft } from "../matching/sighting-draft";
import { SightingMatcher } from "../matching/sighting-matcher";
import { PrismaService } from "../prisma/prisma.service";
import { Alert, AlertHook } from "./alert-hook";
import {
  IngestScheduler,
  INGEST_LOCK_ID,
  INGEST_OPTIONS,
} from "./ingest-scheduler";
import { IngestionModule } from "./ingestion.module";
import {
  AdapterResult,
  JOB_SOURCE_ADAPTERS,
  JobSourceAdapter,
  PollWindow,
} from "./job-source-adapter";
import { AdapterOutcome, PollHooks } from "./poll-hooks";

const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-11-04T12:00:00Z");
const hoursAfter = (h: number) => new Date(T0.getTime() + h * HOUR);

function draft(id: number, over: Partial<SightingDraft> = {}): SightingDraft {
  return {
    jobSource: "jobspy-linkedin",
    listingKey: `linkedin:${id}`,
    url: `https://www.linkedin.com/jobs/view/${id}`,
    reportedAt: T0,
    companyName: "Acme Inc",
    title: "Software Developer",
    location: "Toronto, ON",
    description: "",
    descriptionKind: "none",
    ...over,
  };
}

class FakeAdapter extends JobSourceAdapter {
  windows: PollWindow[] = [];
  seenStop: boolean[] = [];
  // Set to hold a poll open until the test calls release().
  gate?: Promise<void>;
  started!: Promise<void>;
  private markStarted!: () => void;

  constructor(
    readonly name: string,
    public result: AdapterResult | Error = { drafts: [], errors: [] },
    override readonly minIntervalMs: number = HOUR,
  ) {
    super();
    this.rearm();
  }

  rearm() {
    this.started = new Promise((r) => (this.markStarted = r));
  }

  holdOpen() {
    let release!: () => void;
    this.gate = new Promise((r) => (release = r));
    return release;
  }

  async poll(window: PollWindow): Promise<AdapterResult> {
    this.windows.push(window);
    this.markStarted();
    await this.gate;
    this.seenStop.push(window.shouldStop());
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("IngestScheduler", () => {
  let prisma: PrismaService;
  let matcher: SightingMatcher;
  let alerts: Alert[];
  let finished: AdapterOutcome[][];
  const alertHook: AlertHook = {
    alert: async (a) => {
      alerts.push(a);
    },
  };
  const pollHooks: PollHooks = {
    pollFinished: async (o) => {
      finished.push(o);
    },
  };

  const scheduler = (adapters: JobSourceAdapter[], m = matcher) =>
    new IngestScheduler(adapters, m, prisma, alertHook, pollHooks, {
      lockUrl: testDatabaseUrl(),
    });

  beforeAll(async () => {
    prisma = await openTestDb();
    const hooks: MatchingHooks = { descriptionUpgraded: async () => {} };
    matcher = new SightingMatcher(prisma, new CompaniesService(prisma), hooks);
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    alerts = [];
    finished = [];
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });

  it("polls each adapter once per tick, matches its drafts and reports the outcomes", async () => {
    const a = new FakeAdapter("a", {
      drafts: [draft(1), draft(2)],
      errors: [],
    });
    const b = new FakeAdapter("b", {
      drafts: [
        draft(3, { jobSource: "jobspy-indeed", listingKey: "indeed:3" }),
      ],
      errors: [{ kind: "bad-row", message: "row skipped" }],
    });

    await scheduler([a, b]).tick(T0);

    expect(a.windows).toHaveLength(1);
    expect(b.windows).toHaveLength(1);
    expect(await prisma.sighting.count()).toBe(3);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toEqual([
      expect.objectContaining({
        adapter: "a",
        status: "ok",
        drafts: 2,
        matched: 2,
        failedDrafts: 0,
      }),
      expect.objectContaining({
        adapter: "b",
        status: "ok",
        drafts: 1,
        matched: 1,
        errors: [{ kind: "bad-row", message: "row skipped" }],
      }),
    ]);
  });

  it("starts the next window at the last good poll minus an overlap", async () => {
    const a = new FakeAdapter("a");
    const s = scheduler([a]);

    await s.tick(T0);
    await s.tick(hoursAfter(1));

    expect(a.windows[0].since).toEqual(hoursAfter(-24));
    expect(a.windows[1].since.getTime()).toBeLessThan(T0.getTime());
    expect(a.windows[1].since.getTime()).toBeGreaterThanOrEqual(
      T0.getTime() - 3 * HOUR,
    );
  });

  it("caps a long outage at seven days", async () => {
    const a = new FakeAdapter("a");
    const s = scheduler([a]);
    await s.tick(T0);

    await s.tick(hoursAfter(30 * 24));

    expect(a.windows[1].since).toEqual(hoursAfter(30 * 24 - 7 * 24));
  });

  it("skips a tick while a poll is still running, even from another process", async () => {
    const a = new FakeAdapter("a");
    const release = a.holdOpen();
    const first = scheduler([a]).tick(T0);
    await a.started;

    const second = await scheduler([a]).tick(hoursAfter(1));
    release();
    await first;

    expect(second).toBe("skipped");
    expect(a.windows).toHaveLength(1);
    expect(finished).toHaveLength(1);
  });

  it("lets the next tick run once the previous poll is done", async () => {
    const a = new FakeAdapter("a");
    const s = scheduler([a]);

    await s.tick(T0);
    const again = await s.tick(hoursAfter(1));

    expect(again).not.toBe("skipped");
    expect(a.windows).toHaveLength(2);
  });

  it("keeps polling the others when an adapter throws, and alerts", async () => {
    const bad = new FakeAdapter("bad", new Error("kaboom"));
    const good = new FakeAdapter("good", { drafts: [draft(1)], errors: [] });

    await scheduler([bad, good]).tick(T0);

    expect(good.windows).toHaveLength(1);
    expect(await prisma.sighting.count()).toBe(1);
    expect(finished[0]).toEqual([
      expect.objectContaining({
        adapter: "bad",
        status: "failed",
        errors: [{ kind: "fault", message: expect.stringContaining("kaboom") }],
      }),
      expect.objectContaining({ adapter: "good", status: "ok" }),
    ]);
    expect(alerts).toEqual([
      expect.objectContaining({ kind: "fault", adapter: "bad" }),
    ]);
  });

  it.each(["blocked", "fault"] as const)(
    "does not advance the window after a %s error, so the next poll covers it",
    async (kind) => {
      const a = new FakeAdapter("a", {
        drafts: [draft(1)],
        errors: [{ kind, message: "no" }],
      });
      const s = scheduler([a]);

      await s.tick(T0);
      await s.tick(hoursAfter(1));

      expect(finished[0][0].status).toBe("failed");
      expect(a.windows[1].since).toEqual(hoursAfter(1 - 24));
      expect(await prisma.sighting.count()).toBe(1);
    },
  );

  it("treats a draft the matcher rejects as a bad row, so the window still advances", async () => {
    const a = new FakeAdapter("a", {
      drafts: [draft(1, { companyName: "Canada" }), draft(2)],
      errors: [],
    });
    const s = scheduler([a]);

    await s.tick(T0);
    await s.tick(hoursAfter(1));

    expect(finished[0][0]).toEqual(
      expect.objectContaining({
        status: "ok",
        matched: 1,
        failedDrafts: 1,
        errors: [
          { kind: "bad-row", message: expect.stringContaining("linkedin:1") },
        ],
      }),
    );
    expect(a.windows[1].since.getTime()).toBeLessThan(T0.getTime());
    expect(a.windows[1].since.getTime()).toBeGreaterThan(
      hoursAfter(-24).getTime(),
    );
  });

  it("survives losing its lock connection during a poll", async () => {
    const a = new FakeAdapter("a", { drafts: [draft(1)], errors: [] });
    const release = a.holdOpen();
    const tick = scheduler([a]).tick(T0);
    await a.started;

    await prisma.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND objid = ${INGEST_LOCK_ID}`;
    await new Promise((r) => setTimeout(r, 100));
    release();

    expect(await tick).toEqual([expect.objectContaining({ status: "ok" })]);
    expect(await prisma.sighting.count()).toBe(1);
  });

  it("finishes the adapter in progress on shutdown and starts no other", async () => {
    const a = new FakeAdapter("a", {
      drafts: [draft(1), draft(2)],
      errors: [],
    });
    const b = new FakeAdapter("b", { drafts: [draft(3)], errors: [] });
    const s = scheduler([a, b]);
    const release = a.holdOpen();
    const tick = s.tick(T0);
    await a.started;

    let drained = false;
    const drain = s.drain().then(() => (drained = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(drained).toBe(false);
    release();
    await drain;
    await tick;

    expect(b.windows).toHaveLength(0);
    expect(await prisma.sighting.count()).toBe(2);
    expect(finished[0]).toEqual([
      expect.objectContaining({ adapter: "a", status: "ok", matched: 2 }),
      expect.objectContaining({ adapter: "b", status: "skipped" }),
    ]);
    expect(await s.tick(hoursAfter(1))).toBe("skipped");
    expect(b.windows).toHaveLength(0);
  });

  describe("intervals", () => {
    it("runs a 3-hour adapter on the first tick and skips it on the next two", async () => {
      const a = new FakeAdapter("a", { drafts: [], errors: [] }, 3 * HOUR);
      const s = scheduler([a]);

      await s.tick(T0);
      await s.tick(hoursAfter(1));
      await s.tick(hoursAfter(2));
      expect(a.windows).toHaveLength(1);
      expect(finished[1][0].status).toBe("skipped");

      await s.tick(hoursAfter(3));
      expect(a.windows).toHaveLength(2);
    });

    it("still runs an hourly adapter when a tick arrives a few milliseconds early", async () => {
      const a = new FakeAdapter("a");
      const s = scheduler([a]);

      await s.tick(T0);
      await s.tick(new Date(hoursAfter(1).getTime() - 5));

      expect(a.windows).toHaveLength(2);
    });

    it("skips a failed adapter until its interval passes, and keeps its window", async () => {
      const a = new FakeAdapter("a", new Error("down"), 3 * HOUR);
      const s = scheduler([a]);

      await s.tick(T0);
      await s.tick(hoursAfter(1));
      await s.tick(hoursAfter(2));
      expect(a.windows).toHaveLength(1);

      await s.tick(hoursAfter(3));
      expect(a.windows).toHaveLength(2);
      expect(a.windows[1].since).toEqual(hoursAfter(3 - 24));
      const cursor = await prisma.ingestCursor.findUnique({
        where: { adapter: "a" },
      });
      expect(cursor?.lastPollAt).toBeNull();
      expect(cursor?.lastAttemptAt).toEqual(hoursAfter(3));
    });
  });

  describe("board adapters", () => {
    const board = (name: string) =>
      prisma.company.create({
        data: { name, ats: "greenhouse", boardSlug: name.toLowerCase() },
      });

    it("matches the other boards' drafts when one board is blocked, and counts both", async () => {
      const dead = await board("Dead");
      const live = await board("Live");
      const a = new FakeAdapter("boards", {
        drafts: [draft(1, { companyName: "Live" })],
        errors: [
          {
            kind: "blocked",
            message: "403",
            watchedCompanyId: dead.id,
            httpStatus: 403,
          },
        ],
        boards: [
          { watchedCompanyId: dead.id, status: "failed" },
          { watchedCompanyId: live.id, status: "ok" },
        ],
      });

      await scheduler([a]).tick(T0);

      expect(await prisma.sighting.count()).toBe(1);
      expect(finished[0][0]).toEqual(
        expect.objectContaining({
          status: "failed",
          matched: 1,
          boards: { ok: 1, failed: 1, incomplete: 0 },
        }),
      );
      expect(alerts).toEqual([
        expect.objectContaining({
          kind: "blocked",
          adapter: "boards",
          company: "Dead",
        }),
      ]);
    });

    it("alerts a 404 board once across 24 hourly ticks, naming the Company, and again on day two", async () => {
      const gone = await board("Gone");
      const a = new FakeAdapter("boards", {
        drafts: [],
        errors: [
          {
            kind: "blocked",
            message: "404",
            watchedCompanyId: gone.id,
            httpStatus: 404,
          },
        ],
      });
      const s = scheduler([a]);

      for (let h = 0; h < 24; h++) await s.tick(hoursAfter(h));
      expect(alerts).toEqual([expect.objectContaining({ company: "Gone" })]);

      await s.tick(hoursAfter(24));
      expect(alerts).toHaveLength(2);
    });

    it("alerts a non-404 board error on every tick", async () => {
      const slow = await board("Slow");
      const a = new FakeAdapter("boards", {
        drafts: [],
        errors: [{ kind: "fault", message: "500", watchedCompanyId: slow.id }],
      });
      const s = scheduler([a]);

      await s.tick(T0);
      await s.tick(hoursAfter(1));

      expect(alerts).toHaveLength(2);
    });
  });

  it("tells the adapter to stop once the drain starts", async () => {
    const a = new FakeAdapter("a");
    const s = scheduler([a]);
    const release = a.holdOpen();
    const tick = s.tick(T0);
    await a.started;
    expect(a.windows[0].shouldStop()).toBe(false);

    const drain = s.drain();
    expect(a.windows[0].shouldStop()).toBe(true);
    release();
    await drain;
    await tick;
    expect(a.seenStop).toEqual([true]);
  });

  it("adds no duplicate Sightings when an interrupted adapter runs again", async () => {
    const drafts = [draft(1), draft(2), draft(3)];
    const a = new FakeAdapter("a", { drafts, errors: [] });
    let calls = 0;
    const crashing = {
      matchSighting: (d: SightingDraft, o?: { now?: Date }) => {
        if (++calls === 2) throw new Error("killed");
        return matcher.matchSighting(d, o);
      },
    } as SightingMatcher;

    await scheduler([a], crashing).tick(T0);
    expect(finished[0][0]).toEqual(
      expect.objectContaining({
        status: "failed",
        matched: 2,
        failedDrafts: 1,
      }),
    );
    expect(await prisma.sighting.count()).toBe(2);

    await scheduler([a]).tick(hoursAfter(1));

    expect(await prisma.sighting.count()).toBe(3);
    expect(await prisma.posting.count()).toBe(3);
    expect(finished[1][0].status).toBe("ok");
    expect(a.windows[1].since).toEqual(hoursAfter(1 - 24));
  });
});

describe("IngestScheduler in a Nest application", () => {
  it("drains the poll in progress before Prisma disconnects on shutdown", async () => {
    const prisma = new PrismaService(testDatabaseUrl());
    await prisma.$connect();
    await resetTestDb(prisma);
    const adapter = new FakeAdapter("a", {
      drafts: [draft(1), draft(2)],
      errors: [],
    });
    const release = adapter.holdOpen();
    const app = await Test.createTestingModule({ imports: [IngestionModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(JOB_SOURCE_ADAPTERS)
      .useValue([adapter])
      .overrideProvider(INGEST_OPTIONS)
      .useValue({ lockUrl: testDatabaseUrl() })
      .compile();

    await app.init();
    await adapter.started;
    const closing = app.close();
    await new Promise((r) => setTimeout(r, 50));
    release();
    await closing;

    const check = new PrismaService(testDatabaseUrl());
    expect(await check.sighting.count()).toBe(2);
    await resetTestDb(check);
    await check.$disconnect();
  });
});

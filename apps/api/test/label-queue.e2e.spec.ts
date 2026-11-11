import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { Clock, Random } from "../src/labels/labels-env";
import { LabelsModule } from "../src/labels/labels.module";
import { absorbPosting } from "../src/matching/posting-absorb";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  FakeClock,
  LOGIN,
  SeededRandom,
  seedMany,
  seedPosting,
} from "./label-fixtures";
import { openTestDb, resetTestDb } from "./test-db";

const TUNING = new Date("2026-12-01T15:00:00Z");
const TEST = new Date("2026-12-14T15:00:00Z");
const SPOT = new Date("2027-01-05T15:00:00Z");

describe("Label queue", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock();

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, LabelsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(Random)
      .useValue(new SeededRandom(7))
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
    clock.at = TUNING;
  });

  const authed = (r: request.Test) => r.set("Tailscale-User-Login", LOGIN);
  const next = () =>
    authed(request(app.getHttpServer()).get("/label-queue/next"));
  const label = (postingId: unknown, value: unknown) =>
    authed(request(app.getHttpServer()).post("/label-queue/labels")).send({
      postingId,
      label: value,
    });
  const undo = () =>
    authed(request(app.getHttpServer()).delete("/label-queue/labels/last"));

  // Labels whatever the queue shows until it has nothing due; returns the Posting IDs in order.
  async function drain(value = "A", cantTellEvery = 0, max = 300) {
    const ids: number[] = [];
    for (let i = 1; i <= max; i++) {
      const res = await next();
      if (res.status === 204) return ids;
      expect(res.status).toBe(200);
      const v = cantTellEvery && i % cantTellEvery === 0 ? "cant_tell" : value;
      expect((await label(res.body.postingId, v)).status).toBe(201);
      ids.push(res.body.postingId);
    }
    throw new Error("the queue never ran dry");
  }

  const byTierAtDraw = async (where: object = {}) => {
    const rows = await prisma.label.groupBy({
      by: ["tierAtDraw"],
      where,
      _count: true,
    });
    return Object.fromEntries(rows.map((r) => [r.tierAtDraw, r._count]));
  };

  it("returns the Posting's text and nothing derived from its Tier", async () => {
    const id = await seedPosting(prisma, { tier: "A", title: "Backend Dev" });
    const res = await next();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "company",
      "location",
      "postingId",
      "text",
      "title",
    ]);
    expect(res.body.postingId).toBe(id);
    expect(res.body.title).toBe("Backend Dev");
    expect(res.body.text).toMatch(/^Full text/);
    // Reload shows the same Posting until it is labelled.
    expect((await next()).body.postingId).toBe(id);
  });

  it("draws a batch of 3 A, 3 B and 4 C, and about 1 in 4 C picks is capped", async () => {
    await seedMany(prisma, "A", 40);
    await seedMany(prisma, "B", 40);
    await seedMany(prisma, "C", 60);
    await seedMany(prisma, "C", 30, { caps: ["us_only"] });

    for (let b = 0; b < 6; b++) {
      for (let i = 0; i < 10; i++) {
        const res = await next();
        await label(res.body.postingId, "B");
      }
    }
    for (let batch = 1; batch <= 6; batch++) {
      const rows = await prisma.label.findMany({ where: { batch } });
      expect(rows).toHaveLength(10);
      const count = (t: string) =>
        rows.filter((r) => r.tierAtDraw === t).length;
      expect([count("A"), count("B"), count("C")]).toEqual([3, 3, 4]);
    }
    const cPicks = await prisma.label.findMany({
      where: { tierAtDraw: "C" },
      include: { posting: { include: { tier: true } } },
    });
    const capped = cPicks.filter((r) => r.posting.tier!.capsApplied.length > 0);
    expect(cPicks).toHaveLength(24);
    expect(capped.length).toBeGreaterThan(0);
    expect(capped.length).toBeLessThan(14);
    // The batch is shuffled, not A A A B B B C C C C every time.
    const orders = new Set(
      (await prisma.label.findMany({ orderBy: { id: "asc" } }))
        .slice(0, 60)
        .map((r) => r.tierAtDraw)
        .join("")
        .match(/.{10}/g),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("never draws a Thin Posting or one first seen before Nov 15, but draws Closed and Stale ones", async () => {
    await seedPosting(prisma, { tier: "A", kind: "snippet" });
    await seedPosting(prisma, { tier: "A", kind: "none" });
    await seedPosting(prisma, {
      tier: "A",
      firstSeenAt: new Date("2026-11-14T23:00:00Z"),
    });
    const closed = await seedPosting(prisma, {
      tier: "A",
      closedAt: new Date("2026-11-25T00:00:00Z"),
    });
    const stale = await seedPosting(prisma, {
      tier: "B",
      lastSeenAt: new Date("2026-11-16T00:00:00Z"),
    });
    const drawn = await drain("C");
    expect(drawn.sort()).toEqual([closed, stale].sort());
  });

  it("draws from the next Tier down when a Tier runs short", async () => {
    await seedMany(prisma, "A", 1);
    await seedMany(prisma, "B", 10);
    await seedMany(prisma, "C", 10);
    for (let i = 0; i < 10; i++)
      await label((await next()).body.postingId, "B");
    const rows = await prisma.label.findMany();
    const slots = (s: string) => rows.filter((r) => r.slot === s).length;
    expect([slots("A"), slots("B"), slots("C")]).toEqual([3, 3, 4]);
    expect(await byTierAtDraw()).toEqual({ A: 1, B: 5, C: 4 });
  });

  it("records the Tier, config version, phase and time of each draw", async () => {
    await seedMany(prisma, "A", 1);
    await label((await next()).body.postingId, "cant_tell");
    const [row] = await prisma.label.findMany();
    expect(row).toMatchObject({
      label: "cant_tell",
      tierAtDraw: "A",
      configVersion: "cfg-1",
      phase: "tuning",
      createdAt: TUNING,
    });
  });

  it("does nothing outside a phase", async () => {
    await seedMany(prisma, "A", 3);
    clock.at = new Date("2026-11-20T15:00:00Z");
    expect((await next()).status).toBe(204);
    clock.at = new Date("2026-12-21T15:00:00Z");
    expect((await next()).status).toBe(204);
  });

  it("fills 21, 21 and 28 in the test phase, replaces a cant_tell and mixes in 10 week-1 repeats", async () => {
    await seedMany(prisma, "A", 40);
    await seedMany(prisma, "B", 40);
    await seedMany(prisma, "C", 60);
    // 12 week-1 Labels, one of them cant_tell.
    const firstWeek = await prisma.posting.findMany({ take: 12 });
    for (const [i, p] of firstWeek.entries())
      await prisma.label.create({
        data: {
          postingId: p.id,
          label: i === 0 ? "cant_tell" : "B",
          tierAtDraw: "A",
          slot: "A",
          configVersion: "cfg-1",
          phase: "tuning",
          batch: 1 + Math.floor(i / 10),
          createdAt: new Date("2026-12-02T15:00:00Z"),
        },
      });
    clock.at = TEST;
    const shown = await drain("A", 9);

    const test = await prisma.label.findMany({ where: { phase: "test" } });
    const filling = test.filter((r) => r.label !== "cant_tell");
    expect(filling).toHaveLength(70);
    const count = (s: string) => filling.filter((r) => r.slot === s).length;
    expect([count("A"), count("B"), count("C")]).toEqual([21, 21, 28]);
    expect(test.length).toBeGreaterThan(70);

    const repeats = await prisma.label.findMany({ where: { phase: "repeat" } });
    expect(repeats).toHaveLength(10);
    const week1 = new Set(firstWeek.filter((_, i) => i > 0).map((p) => p.id));
    for (const r of repeats) expect(week1.has(r.postingId)).toBe(true);
    expect(new Set(repeats.map((r) => r.postingId)).size).toBe(10);
    // No Posting is shown twice except the repeats.
    expect(new Set(shown).size).toBe(shown.length);
    const seenTwice = shown.filter((id) => week1.has(id));
    expect(seenTwice).toHaveLength(10);
  });

  it("draws 20 C-Tier Postings once a month in the spot check", async () => {
    await seedMany(prisma, "A", 5);
    await seedMany(prisma, "C", 40);
    clock.at = SPOT;
    await drain("C");
    const rows = await prisma.label.findMany();
    expect(rows).toHaveLength(20);
    expect(
      rows.every((r) => r.tierAtDraw === "C" && r.phase === "spot_check"),
    ).toBe(true);
    clock.at = new Date("2027-02-03T15:00:00Z");
    expect((await next()).status).toBe(200);
  });

  describe("undo", () => {
    it("removes the last Label of the batch and draws its Posting again next", async () => {
      await seedMany(prisma, "A", 20);
      await seedMany(prisma, "B", 20);
      await seedMany(prisma, "C", 20);
      const first = (await next()).body.postingId;
      await label(first, "A");
      const second = (await next()).body.postingId;
      await label(second, "B");
      const third = (await next()).body.postingId;

      expect((await undo()).status).toBe(204);
      expect(await prisma.label.count()).toBe(1);
      // The undone Posting is shown next, not the unlabelled one that was on screen.
      expect((await next()).body.postingId).toBe(second);
      expect(third).not.toBe(second);
      expect((await label(second, "C")).status).toBe(201);
      expect(
        (await prisma.label.findFirst({ where: { postingId: second } }))!.label,
      ).toBe("C");
    });

    it("refuses a Label from a window that has closed", async () => {
      await seedMany(prisma, "A", 10);
      await seedMany(prisma, "B", 10);
      await seedMany(prisma, "C", 10);
      for (let i = 0; i < 3; i++)
        await label((await next()).body.postingId, "A");
      clock.at = TEST;
      expect((await undo()).status).toBe(409);
      clock.at = new Date("2026-12-21T15:00:00Z");
      expect((await undo()).status).toBe(409);
      expect(await prisma.label.count()).toBe(3);
    });

    it("drops a draw left over from an earlier window of the same phase", async () => {
      await seedMany(prisma, "A", 10);
      await seedMany(prisma, "B", 10);
      await seedMany(prisma, "C", 10);
      clock.at = TEST;
      const shown = (await next()).body.postingId;
      clock.at = new Date("2026-12-24T15:00:00Z");
      expect((await label(shown, "A")).status).toBe(409);
      expect(await prisma.label.count()).toBe(0);
    });

    it("refuses when there is nothing to undo", async () => {
      expect((await undo()).status).toBe(409);
    });

    it("refuses once the batch is done and keeps its Labels", async () => {
      await seedMany(prisma, "A", 10);
      await seedMany(prisma, "B", 10);
      await seedMany(prisma, "C", 10);
      let last;
      for (let i = 0; i < 10; i++)
        last = await label((await next()).body.postingId, "A");
      expect(last!.body.batchDone).toBe(true);
      expect((await undo()).status).toBe(409);
      expect(await prisma.label.count()).toBe(10);
    });
  });

  describe("validation", () => {
    it("stores nothing for an invalid body", async () => {
      const id = await seedPosting(prisma, { tier: "A" });
      await next();
      for (const body of [
        { postingId: id, label: "D" },
        { postingId: id, label: "a" },
        { postingId: id },
        { label: "A" },
        { postingId: "1", label: "A" },
        { postingId: 1.5, label: "A" },
        { postingId: 0, label: "A" },
        { postingId: id, label: "A", tier: "C" },
        [],
        "A",
      ]) {
        const res = await authed(
          request(app.getHttpServer()).post("/label-queue/labels"),
        ).send(body as object);
        expect(res.status).toBe(400);
      }
      expect(await prisma.label.count()).toBe(0);
    });

    it("answers 409 for a Posting the queue is not showing", async () => {
      const [a, b] = await seedMany(prisma, "A", 2);
      const shown = (await next()).body.postingId;
      const other = shown === a ? b : a;
      expect((await label(other, "A")).status).toBe(409);
      expect((await label(99999, "A")).status).toBe(409);
      expect(await prisma.label.count()).toBe(0);
    });

    it("answers 401 without the Tailscale identity", async () => {
      expect(
        (await request(app.getHttpServer()).get("/label-queue/next")).status,
      ).toBe(401);
    });
  });

  it("never writes a Label value to the logs", async () => {
    await seedMany(prisma, "A", 3);
    const out: string[] = [];
    const spy = (stream: NodeJS.WriteStream) =>
      jest.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
        out.push(String(chunk));
        return true;
      });
    const spies = [spy(process.stdout), spy(process.stderr)];
    try {
      await label((await next()).body.postingId, "cant_tell");
      await label(1, "cant_tell");
      await label(1, "nope");
      await undo();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(out.join("")).not.toContain("cant_tell");
    expect(out.join("")).not.toContain("nope");
  });

  it("keeps Labels when a Posting is absorbed into another", async () => {
    const [from, into] = await seedMany(prisma, "A", 2);
    await prisma.label.create({
      data: {
        postingId: from,
        label: "A",
        tierAtDraw: "A",
        slot: "A",
        configVersion: "cfg-1",
        phase: "tuning",
        batch: 1,
      },
    });
    await prisma.$transaction((tx) => absorbPosting(tx, from, into));
    expect((await prisma.label.findFirst())!.postingId).toBe(into);
  });
});

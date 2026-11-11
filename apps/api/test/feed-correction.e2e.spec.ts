import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { Alert, AlertHook } from "../src/ingestion/alert-hook";
import { Clock } from "../src/labels/labels-env";
import { LabelsModule } from "../src/labels/labels.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { FakeClock, LOGIN, seedPosting } from "./label-fixtures";
import { openTestDb, resetTestDb } from "./test-db";

const DAY = 24 * 60 * 60 * 1000;

class RecordingHook extends AlertHook {
  alerts: Alert[] = [];
  async alert(alert: Alert): Promise<void> {
    this.alerts.push(alert);
  }
}

describe("Feed correction", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const clock = new FakeClock();
  const hook = new RecordingHook();
  const t0 = new Date("2026-12-01T15:00:00Z");

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, LabelsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(AlertHook)
      .useValue(hook)
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
    clock.at = t0;
    hook.alerts = [];
  });

  const correct = (id: number, body: unknown) =>
    request(app.getHttpServer())
      .post(`/postings/${id}/feed-correction`)
      .set("Tailscale-User-Login", LOGIN)
      .send(body as object);
  const day = (n: number) => {
    clock.at = new Date(t0.getTime() + n * DAY);
  };

  it("stores the user's Tier in FeedCorrection and creates no Label", async () => {
    const id = await seedPosting(prisma, { tier: "C" });
    const res = await correct(id, { tier: "B" });
    expect(res.status).toBe(201);
    expect(await prisma.label.count()).toBe(0);
    expect(await prisma.feedCorrection.findMany()).toMatchObject([
      { postingId: id, tier: "B", jevTier: "C" },
    ]);
  });

  it("calls the alert hook once on the third C-to-A correction in 7 days", async () => {
    const ids = [];
    for (let i = 0; i < 6; i++)
      ids.push(await seedPosting(prisma, { tier: "C" }));
    for (let i = 0; i < 2; i++) {
      day(i);
      await correct(ids[i], { tier: "A" });
    }
    expect(hook.alerts).toHaveLength(0);
    day(2);
    await correct(ids[2], { tier: "A" });
    expect(hook.alerts).toHaveLength(1);
    expect(hook.alerts[0].kind).toBe("tier_drift");
    day(3);
    await correct(ids[3], { tier: "A" });
    day(4);
    await correct(ids[4], { tier: "A" });
    expect(hook.alerts).toHaveLength(1);
    // A new window opens 7 days after the alert, and three more corrections fire it again.
    for (const [i, n] of [10, 11, 12].entries()) {
      day(n);
      await correct(ids[i], { tier: "A" });
    }
    expect(hook.alerts).toHaveLength(2);
  });

  it("counts only corrections from C to A", async () => {
    const ids = [];
    for (let i = 0; i < 4; i++)
      ids.push(await seedPosting(prisma, { tier: "C" }));
    const b = await seedPosting(prisma, { tier: "B" });
    await correct(b, { tier: "A" });
    await correct(ids[0], { tier: "B" });
    await correct(ids[1], { tier: "A" });
    await correct(ids[2], { tier: "A" });
    expect(hook.alerts).toHaveLength(0);
    await correct(ids[3], { tier: "A" });
    expect(hook.alerts).toHaveLength(1);
  });

  it("keeps the correction when the alert channel fails", async () => {
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(await seedPosting(prisma, { tier: "C" }));
    const failing = jest
      .spyOn(hook, "alert")
      .mockRejectedValueOnce(new Error("channel down"));
    for (const id of ids)
      expect((await correct(id, { tier: "A" })).status).toBe(201);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await prisma.feedCorrection.count()).toBe(3);
    failing.mockRestore();
  });

  it("rejects an invalid body, an unknown Posting, a Posting with no Tier and the same Tier", async () => {
    const id = await seedPosting(prisma, { tier: "C" });
    for (const body of [
      { tier: "D" },
      {},
      { tier: "cant_tell" },
      { tier: "A", x: 1 },
      [],
    ])
      expect((await correct(id, body)).status).toBe(400);
    expect((await correct(99999, { tier: "A" })).status).toBe(404);
    expect((await correct(id, { tier: "C" })).status).toBe(409);
    await prisma.postingTier.deleteMany();
    expect((await correct(id, { tier: "A" })).status).toBe(409);
    expect(await prisma.feedCorrection.count()).toBe(0);
  });
});

import { openTestDb, resetTestDb } from "../../test/test-db";
import { PrismaService } from "../prisma/prisma.service";
import { discoverBoards } from "./discover-boards";

const UUID = "0b6f1b1e-3c1a-4d57-9c1e-2f4d6a8b9c10";

describe("discoverBoards", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await openTestDb();
  });
  beforeEach(() => resetTestDb(prisma));
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });

  // One Posting with one Sighting of a JobSpy row whose apply link is `directUrl`.
  async function sighting(
    companyId: number,
    directUrl: string | null,
    n = 1,
  ): Promise<number> {
    const now = new Date();
    const posting = await prisma.posting.create({
      data: {
        companyId,
        title: "Software Engineer",
        location: "Toronto",
        description: "x",
        descriptionKind: "full",
        postedAt: now,
      },
    });
    const row = await prisma.sighting.create({
      data: {
        postingId: posting.id,
        jobSource: "jobspy-indeed",
        listingKey: `indeed:${companyId}-${n}`,
        url: "https://indeed.example/1",
        reportedAt: now,
        companyId,
        companyName: "x",
        title: "Software Engineer",
        location: "Toronto",
        description: "x",
        descriptionKind: "full",
        directUrl,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
    return row.id;
  }

  const company = (name: string, data: object = {}) =>
    prisma.company.create({ data: { name, ...data } });
  const reload = (id: number) =>
    prisma.company.findUniqueOrThrow({ where: { id } });

  it("gives a Company with no board the board its apply link names", async () => {
    const acme = await company("Acme");
    const id = await sighting(
      acme.id,
      "https://boards.greenhouse.io/acme/jobs/1",
    );
    const lines: string[] = [];

    const counts = await discoverBoards(prisma, (l) => lines.push(l));

    const after = await reload(acme.id);
    expect([after.ats, after.boardSlug]).toEqual(["greenhouse", "acme"]);
    expect(after.boardFoundAt).toBeInstanceOf(Date);
    expect(counts).toEqual({ found: 1, processed: 1, skipped: 0, failed: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Acme");
    expect(lines[0]).toContain(`sighting=${id}`);
  });

  it("keeps the board a Company already has", async () => {
    const acme = await company("Acme", {
      ats: "lever",
      boardSlug: "acme-lever",
    });
    await sighting(acme.id, "https://boards.greenhouse.io/acme/jobs/1");

    const counts = await discoverBoards(prisma);

    const after = await reload(acme.id);
    expect([after.ats, after.boardSlug, after.boardFoundAt]).toEqual([
      "lever",
      "acme-lever",
      null,
    ]);
    expect(counts.found).toBe(0);
  });

  it("skips a pair that another Company holds and logs it", async () => {
    await company("Acme Corp", { ats: "greenhouse", boardSlug: "acme" });
    const agency = await company("Staffing Agency");
    await sighting(agency.id, `https://boards.greenhouse.io/Acme/jobs/1`);
    const lines: string[] = [];

    const counts = await discoverBoards(prisma, (l) => lines.push(l));

    const after = await reload(agency.id);
    expect([after.ats, after.boardSlug]).toEqual([null, null]);
    expect(counts).toEqual({ found: 1, processed: 0, skipped: 1, failed: 0 });
    expect(lines.join("\n")).toContain("Acme Corp");
  });

  it("gives a pair to only one of two Companies that name it", async () => {
    const a = await company("Acme");
    const b = await company("Acme Group");
    await sighting(a.id, `https://jobs.ashbyhq.com/acme/${UUID}`);
    await sighting(b.id, `https://jobs.ashbyhq.com/acme/${UUID}`, 2);

    const counts = await discoverBoards(prisma);

    expect(counts).toEqual({ found: 2, processed: 1, skipped: 1, failed: 0 });
    expect((await reload(a.id)).boardSlug).toBe("acme");
    expect((await reload(b.id)).boardSlug).toBeNull();
  });

  it("ignores a Sighting with no apply link or a non-ATS link", async () => {
    const acme = await company("Acme");
    await sighting(acme.id, null);
    await sighting(acme.id, "https://acme.com/careers/1", 2);

    const counts = await discoverBoards(prisma);

    expect((await reload(acme.id)).ats).toBeNull();
    expect(counts).toEqual({ found: 0, processed: 0, skipped: 0, failed: 0 });
  });

  it("never re-adds a board cleared by hand, which keeps boardFoundAt", async () => {
    const found = new Date("2026-11-20T00:00:00Z");
    const agency = await company("Staffing Agency", { boardFoundAt: found });
    await sighting(agency.id, "https://boards.greenhouse.io/acme/jobs/1");

    const counts = await discoverBoards(prisma);

    const after = await reload(agency.id);
    expect([after.ats, after.boardSlug, after.boardFoundAt]).toEqual([
      null,
      null,
      found,
    ]);
    expect(counts.found).toBe(0);
  });

  it("changes nothing on a second run", async () => {
    const acme = await company("Acme");
    await sighting(acme.id, "https://boards.greenhouse.io/acme/jobs/1");
    await discoverBoards(prisma);
    const first = await reload(acme.id);

    const counts = await discoverBoards(prisma);

    expect(await reload(acme.id)).toEqual(first);
    expect(counts).toEqual({ found: 0, processed: 0, skipped: 0, failed: 0 });
  });
});

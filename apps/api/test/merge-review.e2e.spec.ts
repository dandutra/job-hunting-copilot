import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { MatchingModule } from "../src/matching/matching.module";
import { MergeReviewModule } from "../src/matching/merge-review.module";
import { SightingDraft } from "../src/matching/sighting-draft";
import { SightingMatcher } from "../src/matching/sighting-matcher";
import { PrismaService } from "../src/prisma/prisma.service";
import { openTestDb, resetTestDb } from "./test-db";

const LOGIN = "tester@example.com";
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-01T12:00:00Z");
const daysAfter = (d: number) => new Date(T0.getTime() + d * DAY);

// Over 30 words, so it counts as evidence for rule 3.
const TEXT =
  "You will design build and operate backend services for our payments platform working with a small team of engineers and product owners. We expect strong skills in TypeScript and PostgreSQL plus a habit of writing tests before shipping changes to production every week.";

function draft(over: Partial<SightingDraft> = {}): SightingDraft {
  return {
    jobSource: "jobspy-linkedin",
    listingKey: "linkedin:100",
    url: "https://www.linkedin.com/jobs/view/100",
    reportedAt: T0,
    companyName: "Acme Inc",
    title: "Software Developer",
    location: "Toronto, ON",
    description: "",
    descriptionKind: "none",
    ...over,
  };
}
const alert = (over: Partial<SightingDraft> = {}) =>
  draft({
    jobSource: "alert-linkedin",
    url: "https://mail.example.com/alert/100",
    ...over,
  });
const indeed = (over: Partial<SightingDraft> = {}) =>
  draft({
    jobSource: "jobspy-indeed",
    listingKey: "indeed:abc",
    url: "https://ca.indeed.com/viewjob?jk=abc",
    ...over,
  });
const greenhouse = (over: Partial<SightingDraft> = {}) =>
  draft({
    jobSource: "greenhouse",
    listingKey: "greenhouse:acme:1",
    url: "https://boards.greenhouse.io/acme/jobs/1",
    ...over,
  });

describe("merge review", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let matcher: SightingMatcher;

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, MatchingModule, MergeReviewModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    matcher = moduleRef.get(SightingMatcher);
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
  });

  const authed = (r: request.Test) => r.set("Tailscale-User-Login", LOGIN);
  const get = (path: string) => authed(request(app.getHttpServer()).get(path));
  const post = (path: string, body: object = {}) =>
    authed(request(app.getHttpServer()).post(path)).send(body);
  const match = (d: SightingDraft, now = T0) =>
    matcher.matchSighting(d, { now });
  const postings = () => prisma.posting.count();
  const lookalikes = () => prisma.lookalike.count();

  describe("merge log", () => {
    it("lists unreviewed text merges before exact-key merges and filters by rule", async () => {
      await match(draft());
      await match(alert()); // exact key: stored reviewed
      await match(indeed({ description: TEXT, descriptionKind: "full" }));
      await match(
        draft({
          listingKey: "linkedin:200",
          url: "https://www.linkedin.com/jobs/view/200",
          description: TEXT,
          descriptionKind: "full",
        }),
      );

      const all = await get("/merge-log");
      expect(all.status).toBe(200);
      expect(all.body.map((e: { rule: string }) => e.rule)).toEqual([
        "text_similarity",
        "shared_listing_key",
      ]);
      expect(all.body[0].reviewedAt).toBeNull();
      expect(all.body[1].reviewedAt).not.toBeNull();
      expect(all.body[0].posting.sightings.length).toBeGreaterThan(1);

      const exact = await get("/merge-log?rule=shared_listing_key");
      expect(exact.body).toHaveLength(1);
    });

    it("marks an entry reviewed", async () => {
      await match(draft({ description: TEXT, descriptionKind: "full" }));
      await match(indeed({ description: TEXT, descriptionKind: "full" }));
      const [entry] = (await get("/merge-log")).body;
      expect(entry.reviewedAt).toBeNull();

      const res = await post(`/merge-log/${entry.id}/review`);
      expect(res.status).toBe(200);
      expect(res.body.reviewedAt).not.toBeNull();
      expect((await get("/merge-log?reviewed=false")).body).toEqual([]);
    });

    it("rejects a reviewed filter that is not true or false", async () => {
      expect((await get("/merge-log?reviewed=")).status).toBe(400);
      expect((await get("/merge-log?reviewed=yes")).status).toBe(400);
    });

    it("answers 404 for an entry that does not exist", async () => {
      expect((await post("/merge-log/9999/review")).status).toBe(404);
    });
  });

  describe("split", () => {
    it("keeps a split pair apart when the same draft arrives again", async () => {
      await match(draft());
      const merged = await match(alert());
      expect(await postings()).toBe(1);

      const res = await post(`/sightings/${merged.sighting.id}/split`);
      expect(res.status).toBe(201);
      expect(await postings()).toBe(2);

      await match(alert(), daysAfter(1));
      await match(draft(), daysAfter(1));
      expect(await postings()).toBe(2);
      expect(await lookalikes()).toBe(0);
    });

    it("recomputes Posted at on both Postings", async () => {
      await match(alert({ reportedAt: T0 }));
      const later = await match(draft({ reportedAt: daysAfter(5) }));
      const first = await prisma.sighting.findFirstOrThrow({
        where: { jobSource: "alert-linkedin" },
      });
      expect(later.posting.postedAt).toEqual(T0);

      const res = await post(`/sightings/${first.id}/split`);
      const original = await prisma.posting.findUniqueOrThrow({
        where: { id: res.body.originalPostingId },
      });
      const detached = await prisma.posting.findUniqueOrThrow({
        where: { id: res.body.postingId },
      });
      expect(original.postedAt).toEqual(daysAfter(5));
      expect(detached.postedAt).toEqual(T0);
      expect(detached.title).toBe("Software Developer");
    });

    it("refuses to split the only Sighting of a Posting", async () => {
      const only = await match(draft());
      expect((await post(`/sightings/${only.sighting.id}/split`)).status).toBe(
        409,
      );
    });

    it("splits an exact-key merge that arrived reviewed", async () => {
      await match(draft());
      const joined = await match(alert());
      const entry = await prisma.mergeLogEntry.findFirstOrThrow();
      expect(entry.reviewedAt).not.toBeNull();
      expect(
        (await post(`/sightings/${joined.sighting.id}/split`)).status,
      ).toBe(201);
    });
  });

  describe("Lookalikes", () => {
    it("lists both Postings with title, Company, location and Sighting URLs", async () => {
      await match(alert());
      await match(greenhouse());

      const res = await get("/lookalikes");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const [link] = res.body;
      expect(link.reason).toBe("same_title");
      expect(link.postings).toHaveLength(2);
      expect(link.postings[0]).toEqual({
        id: expect.any(Number),
        title: "Software Developer",
        location: "Toronto, ON",
        company: { id: expect.any(Number), name: "Acme Inc" },
        sightings: [
          {
            id: expect.any(Number),
            jobSource: "alert-linkedin",
            url: "https://mail.example.com/alert/100",
          },
        ],
      });
      expect(link.postings[1].sightings[0].url).toBe(
        "https://boards.greenhouse.io/acme/jobs/1",
      );
    });

    it("does not create a dismissed Lookalike again on the next poll", async () => {
      await match(alert());
      await match(greenhouse());
      const [link] = (await get("/lookalikes")).body;

      expect((await post(`/lookalikes/${link.id}/dismiss`)).status).toBe(204);
      expect(await lookalikes()).toBe(0);

      await match(alert(), daysAfter(1));
      await match(greenhouse(), daysAfter(1));
      expect(await lookalikes()).toBe(0);
      expect(await postings()).toBe(2);
    });

    it("merges a Lookalike into the lower Posting and logs it reviewed", async () => {
      await match(alert());
      await match(greenhouse());
      const [link] = (await get("/lookalikes")).body;

      const res = await post(`/lookalikes/${link.id}/merge`);
      expect(res.status).toBe(200);
      expect(await postings()).toBe(1);
      expect(
        await prisma.sighting.count({
          where: { postingId: res.body.postingId },
        }),
      ).toBe(2);
      const entry = (await get("/merge-log?rule=manual_merge")).body[0];
      expect(entry.reviewedAt).not.toBeNull();
      expect(await lookalikes()).toBe(0);
    });

    it("adds the second company name as an alias when a merge crosses two", async () => {
      await match(
        alert({
          companyName: "Deloitte",
          description: TEXT,
          descriptionKind: "full",
        }),
      );
      await match(
        indeed({
          companyName: "Deloitte LLP",
          description: TEXT,
          descriptionKind: "full",
        }),
      );
      const [link] = (await get("/lookalikes")).body;
      expect(link.reason).toBe("similar_company");

      await post(`/lookalikes/${link.id}/merge`);
      const survivor = await prisma.posting.findFirstOrThrow({
        include: { company: { include: { aliases: true } } },
      });
      expect(survivor.company.aliases.map((a) => a.name)).toEqual(
        expect.arrayContaining(["Deloitte", "Deloitte LLP"]),
      );

      const later = await match(
        indeed({
          listingKey: "indeed:zzz",
          url: "https://ca.indeed.com/viewjob?jk=zzz",
          companyName: "Deloitte LLP",
          title: "Other Role",
        }),
        daysAfter(1),
      );
      expect(later.posting.companyId).toBe(survivor.companyId);
      expect(await prisma.company.count()).toBe(1);
    });

    it("does not bring a dismissed pair back when a merge moves a third Posting's Lookalike", async () => {
      const a = await match(alert());
      const b = await match(greenhouse());
      const c = await match(
        greenhouse({
          listingKey: "greenhouse:acme:2",
          url: "https://boards.greenhouse.io/acme/jobs/2",
        }),
      );
      const links = (await get("/lookalikes")).body as {
        id: number;
        postings: { id: number }[];
      }[];
      const between = (x: number, y: number) =>
        links.find((l) =>
          [x, y].every((id) => l.postings.some((p) => p.id === id)),
        )!;
      await post(
        `/lookalikes/${between(a.posting.id, c.posting.id).id}/dismiss`,
      );

      await post(`/lookalikes/${between(a.posting.id, b.posting.id).id}/merge`);

      expect((await get("/lookalikes")).body).toEqual([]);
    });

    it("refuses to merge a Lookalike whose Postings were split apart", async () => {
      await match(draft());
      const joined = await match(alert());
      const split = await post(`/sightings/${joined.sighting.id}/split`);
      const [low, high] = [
        split.body.originalPostingId,
        split.body.postingId,
      ].sort((x: number, y: number) => x - y);
      const stale = await prisma.lookalike.create({
        data: {
          lowPostingId: low,
          highPostingId: high,
          reason: "same_title",
          evidence: {},
        },
      });

      expect((await post(`/lookalikes/${stale.id}/merge`)).status).toBe(409);
      expect(await postings()).toBe(2);
    });

    it("answers 404 for a Lookalike that does not exist", async () => {
      expect((await post("/lookalikes/9999/merge")).status).toBe(404);
      expect((await post("/lookalikes/9999/dismiss")).status).toBe(404);
    });
  });

  describe("hand merge", () => {
    it("can be split, and the pair then stays apart", async () => {
      await match(alert());
      const gh = await match(greenhouse());
      const [link] = (await get("/lookalikes")).body;
      await post(`/lookalikes/${link.id}/merge`);

      const split = await post(`/sightings/${gh.sighting.id}/split`);
      expect(split.status).toBe(201);
      expect(await postings()).toBe(2);

      await match(alert(), daysAfter(1));
      await match(greenhouse(), daysAfter(1));
      expect(await postings()).toBe(2);
      expect(await lookalikes()).toBe(0);
    });
  });

  it("rejects a request without the Tailscale login", async () => {
    expect((await request(app.getHttpServer()).get("/lookalikes")).status).toBe(
      401,
    );
  });
});

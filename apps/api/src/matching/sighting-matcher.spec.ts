import { Posting } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { openTestDb, resetTestDb } from "../../test/test-db";
import { CompaniesService } from "../companies/companies.service";
import { MatchingHooks } from "./matching-hooks";
import { SightingDraft } from "./sighting-draft";
import { SightingMatcher } from "./sighting-matcher";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-01T12:00:00Z");
const daysAfter = (d: number, from = T0) => new Date(from.getTime() + d * DAY);

function draft(overrides: Partial<SightingDraft> = {}): SightingDraft {
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
    ...overrides,
  };
}

describe("SightingMatcher", () => {
  let prisma: PrismaService;
  let upgrades: Posting[];
  let matcher: SightingMatcher;

  beforeAll(async () => {
    prisma = await openTestDb();
    upgrades = [];
    const hooks: MatchingHooks = {
      descriptionUpgraded: async (posting) => {
        upgrades.push(posting);
      },
    };
    matcher = new SightingMatcher(prisma, new CompaniesService(prisma), hooks);
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    upgrades.length = 0;
  });
  afterAll(async () => {
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });

  describe("shared listing key", () => {
    it("puts a LinkedIn alert and JobSpy-LinkedIn on one Posting as two Sightings", async () => {
      const a = await matcher.matchSighting(
        draft({ jobSource: "alert-linkedin" }),
        { now: T0 },
      );
      const b = await matcher.matchSighting(draft(), { now: daysAfter(1) });

      expect(b.posting.id).toBe(a.posting.id);
      expect(b.sighting.id).not.toBe(a.sighting.id);
      expect(await prisma.posting.count()).toBe(1);
      expect(await prisma.sighting.count()).toBe(2);
    });

    it("updates the same Sighting and its last-seen when one source reports a listing again", async () => {
      const first = await matcher.matchSighting(draft(), { now: T0 });
      const again = await matcher.matchSighting(draft(), {
        now: daysAfter(3),
      });

      expect(again.sighting.id).toBe(first.sighting.id);
      expect(again.sighting.lastSeenAt).toEqual(daysAfter(3));
      expect(await prisma.sighting.count()).toBe(1);
      expect(await prisma.mergeLogEntry.count()).toBe(0);
    });

    it("keeps two LinkedIn ids with the same Company and title as two Postings", async () => {
      const a = await matcher.matchSighting(draft(), { now: T0 });
      const b = await matcher.matchSighting(
        draft({ listingKey: "linkedin:200" }),
        { now: T0 },
      );

      expect(b.posting.id).not.toBe(a.posting.id);
      expect(await prisma.posting.count()).toBe(2);
      expect(await prisma.mergeLogEntry.count()).toBe(0);
    });

    it("gives a Workday requisition on two sites one Posting", async () => {
      const a = await matcher.matchSighting(
        draft({ jobSource: "workday", listingKey: "workday:acme:JR100-1" }),
        { now: T0 },
      );
      const b = await matcher.matchSighting(
        draft({ jobSource: "workday", listingKey: "workday:acme:JR100-2" }),
        { now: daysAfter(1) },
      );

      expect(b.posting.id).toBe(a.posting.id);
      expect(await prisma.posting.count()).toBe(1);
    });
  });

  it("creates one Posting when the same draft is matched concurrently", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        matcher.matchSighting(draft(), { now: T0 }),
      ),
    );

    expect(await prisma.posting.count()).toBe(1);
    expect(await prisma.sighting.count()).toBe(1);
  });

  it("rejects a blank listing key", async () => {
    await expect(
      matcher.matchSighting(draft({ listingKey: "  " }), { now: T0 }),
    ).rejects.toThrow();
    expect(await prisma.sighting.count()).toBe(0);
  });

  it("loses no Sighting when concurrent drafts hit keys of Postings that merge", async () => {
    await matcher.matchSighting(draft(), { now: T0 });
    await matcher.matchSighting(
      draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
      { now: T0 },
    );
    await matcher.matchSighting(
      draft({
        jobSource: "adzuna",
        listingKey: "greenhouse:acme:1",
        title: "Adzuna title",
      }),
      { now: T0 },
    );

    await Promise.all([
      matcher.matchSighting(
        draft({
          jobSource: "alert-linkedin",
          directUrl: "https://boards.greenhouse.io/acme/jobs/1",
        }),
        { now: T0 },
      ),
      matcher.matchSighting(
        draft({
          jobSource: "alert-indeed",
          listingKey: "greenhouse:acme:1",
        }),
        { now: T0 },
      ),
    ]);

    expect(await prisma.posting.count()).toBe(1);
    expect(await prisma.sighting.count()).toBe(5);
    const posting = await prisma.posting.findFirstOrThrow();
    expect(posting.title).toBe("Software Developer");
  });

  it("matches a burst larger than the connection pool without rejecting a draft", async () => {
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        matcher.matchSighting(draft({ listingKey: `linkedin:${i}` }), {
          now: T0,
        }),
      ),
    );

    expect(await prisma.posting.count()).toBe(60);
  }, 30_000);

  describe("the one-board veto", () => {
    const gh = (id: number) => `https://boards.greenhouse.io/acme/jobs/${id}`;

    it("ignores a later directUrl for another listing of a board the Posting holds", async () => {
      const board = await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      const indeed = draft({
        jobSource: "jobspy-indeed",
        listingKey: "indeed:abc",
      });
      await matcher.matchSighting({ ...indeed, directUrl: gh(1) }, { now: T0 });

      const later = await matcher.matchSighting(
        { ...indeed, directUrl: gh(2) },
        { now: daysAfter(1) },
      );

      expect(later.posting.id).toBe(board.posting.id);
      expect(later.sighting.directKey).toBe("greenhouse:acme:1");
    });

    it("does not absorb two candidates that conflict with each other", async () => {
      await matcher.matchSighting(draft(), { now: T0 });
      await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({
          jobSource: "jobspy-indeed",
          listingKey: "indeed:x",
          directUrl: gh(1),
        }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({
          jobSource: "jobspy-indeed",
          listingKey: "indeed:y",
          directUrl: gh(1),
        }),
        { now: T0 },
      );

      await matcher.matchSighting(
        draft({ jobSource: "alert-linkedin", directUrl: gh(1) }),
        { now: T0 },
      );

      const onOnePosting = await prisma.sighting.groupBy({
        by: ["postingId"],
        where: { listingKey: { in: ["indeed:x", "indeed:y"] } },
        _count: true,
      });
      expect(onOnePosting).toHaveLength(2);
    });

    it("counts a Sighting older than the window when it vetoes a join", async () => {
      const board = await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({ jobSource: "adzuna", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({
          listingKey: "linkedin:100",
          directUrl: gh(1),
        }),
        { now: daysAfter(25) },
      );

      const later = await matcher.matchSighting(
        draft({ jobSource: "alert-linkedin", directUrl: gh(2) }),
        { now: daysAfter(40) },
      );
      const repost = await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:2" }),
        { now: daysAfter(41) },
      );

      expect(later.posting.id).toBe(board.posting.id);
      expect(repost.posting.id).not.toBe(board.posting.id);
    });

    it("keeps a draft on the Posting of its own listing key when its directUrl conflicts", async () => {
      const home = await matcher.matchSighting(draft({ directUrl: gh(1) }), {
        now: T0,
      });
      await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:2" }),
        { now: T0 },
      );

      const alert = await matcher.matchSighting(
        draft({ jobSource: "alert-linkedin", directUrl: gh(2) }),
        { now: T0 },
      );

      expect(alert.posting.id).toBe(home.posting.id);
      expect(alert.sighting.directKey).toBeNull();
      expect(alert.sighting.directUrl).toBeNull();
    });
  });

  describe("directUrl", () => {
    const greenhouse = draft({
      jobSource: "greenhouse",
      listingKey: "greenhouse:acme:4012345",
      url: "https://boards.greenhouse.io/acme/jobs/4012345",
      description: "The full text",
      descriptionKind: "full",
    });
    const indeed = draft({
      jobSource: "jobspy-indeed",
      listingKey: "indeed:abc",
      url: "https://ca.indeed.com/viewjob?jk=abc",
      directUrl: "https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x",
    });

    it("joins an Indeed draft to the Greenhouse Posting its directUrl names", async () => {
      const gh = await matcher.matchSighting(greenhouse, { now: T0 });
      const ind = await matcher.matchSighting(indeed, { now: daysAfter(1) });

      expect(ind.posting.id).toBe(gh.posting.id);
      expect(await prisma.sighting.count()).toBe(2);
    });

    it("joins when the Greenhouse draft arrives after the Indeed one", async () => {
      const ind = await matcher.matchSighting(indeed, { now: T0 });
      const gh = await matcher.matchSighting(greenhouse, {
        now: daysAfter(1),
      });

      expect(gh.posting.id).toBe(ind.posting.id);
    });

    it("ignores a directUrl that is not a known ATS listing", async () => {
      const gh = await matcher.matchSighting(greenhouse, { now: T0 });
      const ind = await matcher.matchSighting(
        { ...indeed, directUrl: "https://acme.com/careers/42" },
        { now: T0 },
      );

      expect(ind.posting.id).not.toBe(gh.posting.id);
    });

    it("does not join a directUrl to another listing on the same board", async () => {
      const gh = await matcher.matchSighting(greenhouse, { now: T0 });
      const other = await matcher.matchSighting(
        draft({
          jobSource: "greenhouse",
          listingKey: "greenhouse:acme:999",
          directUrl: "https://boards.greenhouse.io/acme/jobs/4012345",
        }),
        { now: T0 },
      );

      expect(other.posting.id).not.toBe(gh.posting.id);
    });

    it("does not join a Posting that already holds another listing of the draft's board", async () => {
      const first = await matcher.matchSighting(indeed, { now: T0 });
      const second = await matcher.matchSighting(
        { ...indeed, listingKey: "indeed:other" },
        { now: T0 },
      );

      expect(second.posting.id).not.toBe(first.posting.id);
    });
  });

  describe("the 30-day window", () => {
    it("starts a new Posting for a repost 31 days after the last Sighting", async () => {
      const first = await matcher.matchSighting(draft(), { now: T0 });
      const repost = await matcher.matchSighting(draft(), {
        now: daysAfter(31),
      });

      expect(repost.posting.id).not.toBe(first.posting.id);
      expect(repost.sighting.id).not.toBe(first.sighting.id);
      expect(repost.posting.postedAt).toEqual(T0);
    });

    it("still joins 29 days after the last Sighting, and last-seen restarts the window", async () => {
      const first = await matcher.matchSighting(draft(), { now: T0 });
      await matcher.matchSighting(draft(), { now: daysAfter(29) });
      const later = await matcher.matchSighting(draft(), {
        now: daysAfter(58),
      });

      expect(later.posting.id).toBe(first.posting.id);
    });
  });

  describe("Posted at", () => {
    it("is the earliest Sighting date whatever order drafts arrive in", async () => {
      const early = new Date("2026-09-20T08:00:00Z");
      const late = new Date("2026-09-25T08:00:00Z");
      await matcher.matchSighting(
        draft({ jobSource: "alert-linkedin", reportedAt: late }),
        { now: T0 },
      );
      const result = await matcher.matchSighting(draft({ reportedAt: early }), {
        now: T0,
      });
      const afterLater = await matcher.matchSighting(
        draft({
          jobSource: "adzuna",
          listingKey: "linkedin:100",
          reportedAt: late,
        }),
        { now: T0 },
      );

      expect(result.posting.postedAt).toEqual(early);
      expect(afterLater.posting.postedAt).toEqual(early);
    });
  });

  describe("field precedence", () => {
    it("takes Posting fields from the board, then JobSpy, then Adzuna, then alerts", async () => {
      const key = "greenhouse:acme:7";
      await matcher.matchSighting(
        draft({
          jobSource: "alert-indeed",
          listingKey: key,
          title: "Alert title",
          location: "Alert place",
        }),
        { now: T0 },
      );
      let result = await matcher.matchSighting(
        draft({
          jobSource: "adzuna",
          listingKey: key,
          title: "Adzuna title",
          location: "Adzuna place",
        }),
        { now: T0 },
      );
      expect(result.posting.title).toBe("Adzuna title");

      result = await matcher.matchSighting(
        draft({
          jobSource: "jobspy-indeed",
          listingKey: key,
          title: "JobSpy title",
          location: "JobSpy place",
        }),
        { now: T0 },
      );
      expect(result.posting.title).toBe("JobSpy title");

      result = await matcher.matchSighting(
        draft({
          jobSource: "greenhouse",
          listingKey: key,
          title: "Board title",
          location: "Board place",
        }),
        { now: T0 },
      );
      expect(result.posting).toMatchObject({
        title: "Board title",
        location: "Board place",
      });

      result = await matcher.matchSighting(
        draft({
          jobSource: "alert-indeed",
          listingKey: key,
          title: "Alert title again",
        }),
        { now: T0 },
      );
      expect(result.posting.title).toBe("Board title");
    });

    it("uses the Watched company the board draft names", async () => {
      const company = await prisma.company.create({
        data: { name: "Acme Corporation Ltd" },
      });
      const result = await matcher.matchSighting(
        draft({
          jobSource: "greenhouse",
          listingKey: "greenhouse:acme:7",
          companyName: "Whatever the board calls it",
          watchedCompanyId: company.id,
        }),
        { now: T0 },
      );

      expect(result.posting.companyId).toBe(company.id);
    });

    it("keeps the full description from a lower source when the top source has none", async () => {
      await matcher.matchSighting(
        draft({
          jobSource: "alert-linkedin",
          description: "Full text from the alert page",
          descriptionKind: "full",
        }),
        { now: T0 },
      );
      const result = await matcher.matchSighting(draft(), { now: T0 });

      expect(result.posting).toMatchObject({
        description: "Full text from the alert page",
        descriptionKind: "full",
      });
    });
  });

  describe("descriptionUpgraded", () => {
    const snippet = draft({
      jobSource: "adzuna",
      listingKey: "adzuna:9",
      description: "A snippet...",
      descriptionKind: "snippet",
    });
    const full = (text: string) =>
      draft({
        jobSource: "jobspy-linkedin",
        listingKey: "adzuna:9",
        description: text,
        descriptionKind: "full",
      });

    it("fires once when the description goes from snippet to full, not when full replaces full", async () => {
      await matcher.matchSighting(snippet, { now: T0 });
      expect(upgrades).toHaveLength(0);

      await matcher.matchSighting(full("The whole text"), { now: T0 });
      expect(upgrades).toHaveLength(1);
      expect(upgrades[0].description).toBe("The whole text");

      await matcher.matchSighting(full("The whole text, edited"), { now: T0 });
      await matcher.matchSighting(full("The whole text, edited"), { now: T0 });
      expect(upgrades).toHaveLength(1);
    });

    it("fires for a Posting born with a full description", async () => {
      await matcher.matchSighting(full("Born full"), { now: T0 });

      expect(upgrades).toHaveLength(1);
    });

    it("fires when the Posting had no description", async () => {
      await matcher.matchSighting(draft({ listingKey: "adzuna:9" }), {
        now: T0,
      });
      await matcher.matchSighting(full("Arrived later"), { now: T0 });

      expect(upgrades).toHaveLength(1);
    });
  });

  describe("merge log", () => {
    it("writes an entry with the rule and evidence for a shared listing key", async () => {
      await matcher.matchSighting(draft({ jobSource: "alert-linkedin" }), {
        now: T0,
      });
      const joined = await matcher.matchSighting(draft(), { now: T0 });

      const entries = await prisma.mergeLogEntry.findMany();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        rule: "shared_listing_key",
        postingId: joined.posting.id,
        sightingId: joined.sighting.id,
        evidence: { key: "linkedin:100" },
      });
    });

    it("writes a direct_url entry when the directUrl joined the draft", async () => {
      await matcher.matchSighting(
        draft({
          jobSource: "greenhouse",
          listingKey: "greenhouse:acme:4012345",
        }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({
          jobSource: "jobspy-indeed",
          listingKey: "indeed:abc",
          directUrl: "https://boards.greenhouse.io/acme/jobs/4012345",
        }),
        { now: T0 },
      );

      const entries = await prisma.mergeLogEntry.findMany();
      expect(entries).toHaveLength(1);
      expect(entries[0].rule).toBe("direct_url");
      expect(entries[0].evidence).toMatchObject({
        key: "greenhouse:acme:4012345",
        directUrl: "https://boards.greenhouse.io/acme/jobs/4012345",
      });
    });

    it("merges two Postings that one draft links by two exact keys, and logs the absorbed one", async () => {
      const a = await matcher.matchSighting(
        draft({ listingKey: "linkedin:100" }),
        { now: T0 },
      );
      const b = await matcher.matchSighting(
        draft({
          jobSource: "greenhouse",
          listingKey: "greenhouse:acme:1",
        }),
        { now: T0 },
      );
      expect(b.posting.id).not.toBe(a.posting.id);

      const bridge = await matcher.matchSighting(
        draft({
          jobSource: "jobspy-indeed",
          listingKey: "linkedin:100",
          directUrl: "https://boards.greenhouse.io/acme/jobs/1",
        }),
        { now: T0 },
      );

      expect(await prisma.posting.count()).toBe(1);
      expect(await prisma.sighting.count()).toBe(3);
      const absorbed = await prisma.mergeLogEntry.findMany({
        where: { absorbedPostingId: { not: null } },
      });
      expect(absorbed).toHaveLength(1);
      expect(absorbed[0].postingId).toBe(bridge.posting.id);
    });

    it("never merges Postings whose Sightings hold different listings of one board", async () => {
      await matcher.matchSighting(
        draft({ directUrl: "https://boards.greenhouse.io/acme/jobs/1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:1" }),
        { now: T0 },
      );
      await matcher.matchSighting(
        draft({ jobSource: "greenhouse", listingKey: "greenhouse:acme:2" }),
        { now: T0 },
      );
      const before = await prisma.posting.count();

      // Links greenhouse 2 to linkedin 100, but greenhouse 1 already sits with linkedin 100.
      await matcher.matchSighting(
        draft({
          jobSource: "alert-linkedin",
          directUrl: "https://boards.greenhouse.io/acme/jobs/2",
        }),
        { now: T0 },
      );

      expect(await prisma.posting.count()).toBe(before);
      expect(
        await prisma.mergeLogEntry.count({
          where: { absorbedPostingId: { not: null } },
        }),
      ).toBe(0);
    });
  });
});

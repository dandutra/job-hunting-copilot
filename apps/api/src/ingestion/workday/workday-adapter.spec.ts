import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { WorkdayAdapter, WorkdayHttp } from "./workday-adapter";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "fixtures.json"), "utf8"),
);

const NOW = new Date("2026-11-09T12:00:00Z");
const window = (stop = () => false) => ({
  since: new Date("2026-11-09T08:00:00Z"),
  now: NOW,
  shouldStop: stop,
});

const BASE =
  "https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs";

interface Call {
  method: "GET" | "POST";
  url: string;
  body?: {
    appliedFacets: Record<string, string[]>;
    limit: number;
    offset: number;
  };
  headers: Record<string, string>;
}

function row(n: number, locationsText = "Toronto, Ontario") {
  return {
    title: `Job ${n}`,
    externalPath: `/job/Toronto-Ontario/Job-${n}_JR${n}-1`,
    locationsText,
    postedOn: "Posted Today",
    bulletFields: [`JR${n}`],
  };
}

const ok = (json: unknown) => ({ status: 200, body: JSON.stringify(json) });

// A tenant that serves `rows` in pages of 20 and wraps to page one past the end, as Workday does.
function tenant(
  rows: unknown[],
  opts: { facets?: unknown[]; detail?: (path: string) => unknown } = {},
) {
  const calls: Call[] = [];
  const http: WorkdayHttp = {
    async post(url, body, headers) {
      const parsed = JSON.parse(body);
      calls.push({ method: "POST", url, body: parsed, headers });
      const wrapped = parsed.offset >= rows.length;
      const offset = wrapped ? 0 : parsed.offset;
      const first = offset === 0;
      return ok({
        total: first ? rows.length : 0,
        jobPostings: rows.slice(offset, offset + 20),
        facets: first ? (opts.facets ?? []) : [],
      });
    },
    async get(url, headers) {
      calls.push({ method: "GET", url, headers });
      const path = url.slice(BASE.length);
      return ok(
        opts.detail?.(path) ?? {
          jobPostingInfo: { ...fixtures.detailToronto.jobPostingInfo },
        },
      );
    },
  };
  return { http, calls };
}

const lists = (calls: Call[]) => calls.filter((c) => c.method === "POST");
const details = (calls: Call[]) => calls.filter((c) => c.method === "GET");

function make(
  http: WorkdayHttp,
  stored: Record<string, unknown>[] = [],
  boardSlug = "manulife.wd3/MFCJH_Jobs",
) {
  const sleeps: number[] = [];
  const findMany = jest.fn(
    async (args: {
      where: { listingKey: { in: string[] }; lastSeenAt: { gte: Date } };
    }) => {
      const keys: string[] = args.where.listingKey.in;
      return stored.filter(
        (s) =>
          keys.includes(s.listingKey as string) &&
          ((s.lastSeenAt as Date | undefined) ?? NOW) >=
            args.where.lastSeenAt.gte,
      );
    },
  );
  const adapter = new WorkdayAdapter(
    {
      company: {
        findMany: async () => [
          { id: 7, name: "Manulife", ats: "workday", boardSlug },
        ],
      },
      sighting: { findMany },
    } as unknown as ConstructorParameters<typeof WorkdayAdapter>[0],
    http,
    async (ms) => {
      sleeps.push(ms);
    },
  );
  return { adapter, sleeps, findMany };
}

describe("WorkdayAdapter", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "log").mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it("polls every 3 hours", () => {
    expect(make(tenant([]).http).adapter.minIntervalMs).toBe(3 * 3600_000);
  });

  it("takes 3 list calls for a 45-row tenant and stops although offset 60 would wrap", async () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i));
    const { http, calls } = tenant(rows);
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(lists(calls).map((c) => c.body!.offset)).toEqual([0, 20, 40]);
    expect(lists(calls).every((c) => c.body!.limit === 20)).toBe(true);
    expect(lists(calls)[0].url).toBe(`${BASE}/jobs`);
    expect(result.drafts).toHaveLength(45);
    expect(result.completeBoards).toEqual([7]);
    expect(result.errors).toEqual([]);
    expect(result.boards).toEqual([
      { watchedCompanyId: 7, status: "ok", rows: 45 },
    ]);
  });

  it("dedupes a wrapped page that came back early", async () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i));
    const { http, calls } = tenant(rows);
    const realPost = http.post.bind(http);
    http.post = async (url, body, headers) => {
      const parsed = JSON.parse(body);
      // Offset 20 answers with page one again.
      return realPost(
        url,
        JSON.stringify({
          ...parsed,
          offset: parsed.offset === 20 ? 0 : parsed.offset,
        }),
        headers,
      );
    };
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    const keys = result.drafts.map((d) => d.listingKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(25);
    expect(details(calls)).toHaveLength(25);
  });

  it("builds a draft from the list row and the detail call", async () => {
    const { http, calls } = tenant([fixtures.page.jobPostings[0]]);
    const { adapter } = make(http);

    const { drafts } = await adapter.poll(window());

    expect(details(calls).map((c) => c.url)).toEqual([
      `${BASE}${fixtures.page.jobPostings[0].externalPath}`,
    ]);
    expect(drafts).toEqual([
      {
        jobSource: "workday",
        listingKey: "workday:manulife:jr26100844",
        url: "https://manulife.wd3.myworkdayjobs.com/MFCJH_Jobs/job/Toronto-Ontario/Senior-Technology-Project-Manager--Group-Functions-Technology_JR26100844-1",
        reportedAt: new Date("2026-10-29T00:00:00Z"),
        companyName: "Manulife",
        title: "Senior Technology Project Manager, Group Functions Technology",
        location: "Toronto, Ontario",
        description:
          "Working within Technology Business Management & Strategy.\nPlan\nDeliver",
        descriptionKind: "full",
        watchedCompanyId: 7,
      },
    ]);
  });

  it("makes no detail call for a key that has a stored Sighting, and reuses its fields", async () => {
    const rows = [row(1), row(2)];
    const { http, calls } = tenant(rows);
    const stored = [1, 2].map((n) => ({
      listingKey: `workday:manulife:jr${n}`,
      url: `https://stored/${n}`,
      reportedAt: new Date("2026-10-01T00:00:00Z"),
      title: `Stored ${n}`,
      location: "Toronto, Ontario",
      description: `Stored text ${n}`,
      descriptionKind: "full",
    }));
    const { adapter } = make(http, stored);

    const { drafts, completeBoards } = await adapter.poll(window());

    expect(details(calls)).toHaveLength(0);
    // The list title is free and Workday retitles jobs, so it wins over the stored one.
    expect(drafts.map((d) => [d.title, d.description, d.url])).toEqual([
      ["Job 1", "Stored text 1", "https://stored/1"],
      ["Job 2", "Stored text 2", "https://stored/2"],
    ]);
    expect(drafts[0].reportedAt).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(completeBoards).toEqual([7]);
  });

  it("makes a detail call for a key whose Sighting is older than the matcher's 30-day window", async () => {
    const { http, calls } = tenant([row(1)]);
    const { adapter } = make(http, [
      {
        listingKey: "workday:manulife:jr1",
        lastSeenAt: new Date("2026-10-09T11:00:00Z"),
        url: "https://stored/1",
        reportedAt: new Date("2026-09-01T00:00:00Z"),
        title: "Old",
        location: "Toronto, Ontario",
        description: "Old text",
        descriptionKind: "full",
      },
    ]);

    const { drafts } = await adapter.poll(window());

    expect(details(calls)).toHaveLength(1);
    expect(drafts[0].reportedAt).toEqual(new Date("2026-10-29T00:00:00Z"));
  });

  it("makes one detail call for an out-of-area '3 Locations' row, and none on the second poll", async () => {
    const rows = [fixtures.page.jobPostings[2]];
    const { http, calls } = tenant(rows, {
      detail: () => fixtures.detailSingapore,
    });
    const { adapter } = make(http);

    const first = await adapter.poll(window());
    const second = await adapter.poll(window());

    expect(details(calls)).toHaveLength(1);
    expect(first.drafts).toEqual([]);
    expect(second.drafts).toEqual([]);
    expect(first.boards).toEqual([
      { watchedCompanyId: 7, status: "ok", rows: 1 },
    ]);
    expect(first.completeBoards).toEqual([7]);
  });

  it("keeps a '3 Locations' row when one of its locations is in the area", async () => {
    const { http } = tenant([fixtures.page.jobPostings[2]], {
      detail: () => fixtures.detailMultiToronto,
    });
    const { adapter } = make(http);

    const { drafts } = await adapter.poll(window());

    expect(drafts).toHaveLength(1);
    expect(drafts[0].location).toBe("Singapore, Singapore; Toronto, Ontario");
  });

  it("drops a single-location row outside the area without a detail call", async () => {
    const { http, calls } = tenant([fixtures.page.jobPostings[1]]);
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(details(calls)).toHaveLength(0);
    expect(result.drafts).toEqual([]);
    expect(result.completeBoards).toEqual([7]);
  });

  it("leaves the tenant out of completeBoards when shouldStop turns true mid-tenant", async () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i));
    const { http, calls } = tenant(rows);
    const { adapter } = make(http);
    let n = 0;

    const result = await adapter.poll(window(() => ++n > 3));

    expect(calls.length).toBe(3);
    expect(result.completeBoards).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.boards).toEqual([
      { watchedCompanyId: 7, status: "incomplete" },
    ]);
  });

  it("gives a fault for a 422, which means a wrong wdN", async () => {
    const { adapter } = make({
      post: async () => ({ status: 422, body: "{}" }),
      get: async () => ({ status: 500, body: "" }),
    });

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "fault",
        httpStatus: 422,
        watchedCompanyId: 7,
        message: expect.stringContaining("wdN"),
      }),
    ]);
    expect(result.completeBoards).toEqual([]);
    expect(result.boards).toEqual([{ watchedCompanyId: 7, status: "failed" }]);
  });

  it.each([429, 403])(
    "gives blocked for a %i on the list call",
    async (status) => {
      const { adapter } = make({
        post: async () => ({ status, body: "" }),
        get: async () => ({ status: 500, body: "" }),
      });

      const result = await adapter.poll(window());

      expect(result.errors).toEqual([
        expect.objectContaining({ kind: "blocked", httpStatus: status }),
      ]);
    },
  );

  it("gives blocked for a 429 on a detail call and keeps the board incomplete", async () => {
    const { http } = tenant([row(1), row(2)]);
    http.get = async () => ({ status: 429, body: "" });
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "blocked", httpStatus: 429 }),
    ]);
    expect(result.completeBoards).toEqual([]);
  });

  it("skips a row whose detail answers 403 S22, a listing that closed mid-pass, and reads the rest", async () => {
    const { http } = tenant([row(1), row(2)]);
    const realGet = http.get.bind(http);
    http.get = async (url, h) =>
      url.includes("Job-1_")
        ? {
            status: 403,
            body: '{"errorCode":"S22","message":"permission denied"}',
          }
        : realGet(url, h);
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "bad-row" }),
    ]);
    expect(result.drafts).toHaveLength(1);
    expect(result.boards).toEqual([
      { watchedCompanyId: 7, status: "ok", rows: 2 },
    ]);
  });

  it("gives blocked for a plain 403 on a detail call", async () => {
    const { http } = tenant([row(1)]);
    http.get = async () => ({ status: 403, body: "Forbidden" });
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "blocked", httpStatus: 403 }),
    ]);
  });

  it("calls a detail failure on one row a bad-row and keeps the board incomplete", async () => {
    const { http } = tenant([row(1), row(2)]);
    const realGet = http.get.bind(http);
    http.get = async (url, h) =>
      url.includes("Job-1_") ? { status: 404, body: "{}" } : realGet(url, h);
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "bad-row" }),
    ]);
    expect(result.drafts).toHaveLength(1);
    expect(result.completeBoards).toEqual([]);
  });

  it("judges a row with no locationsText by its detail call, as Thomson Reuters lists every row", async () => {
    const { http, calls } = tenant([row(1, ""), row(2, "")], {
      detail: (path) =>
        path.includes("Job-1_")
          ? fixtures.detailToronto
          : fixtures.detailSingapore,
    });
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(details(calls)).toHaveLength(2);
    expect(result.drafts.map((d) => d.listingKey)).toEqual([
      "workday:manulife:jr1",
    ]);
    expect(result.errors).toEqual([]);
    expect(result.completeBoards).toEqual([7]);
  });

  it("calls a row a bad-row when neither the list nor the detail has a location", async () => {
    const { http } = tenant([row(1, "")], {
      detail: () => ({
        jobPostingInfo: { title: "x", jobDescription: "<p>x</p>" },
      }),
    });
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "bad-row" }),
    ]);
    expect(result.completeBoards).toEqual([]);
  });

  // Nvidia's shape: Canada sits under locationHierarchy1, not a country facet.
  const hierarchyFacets = (locationsCanada: string, locationsCount: number) => [
    {
      facetParameter: "locationMainGroup",
      values: [
        {
          facetParameter: "locations",
          values: [
            { descriptor: locationsCanada, id: "loc", count: locationsCount },
          ],
        },
        {
          facetParameter: "locationHierarchy1",
          values: [{ descriptor: "Canada", id: "ca9", count: 20 }],
        },
      ],
    },
  ];

  it("filters on a non-country Canada facet to save calls, but never calls the tenant complete", async () => {
    const calls: Call[] = [];
    const http: WorkdayHttp = {
      async post(url, body, headers) {
        const parsed = JSON.parse(body);
        calls.push({ method: "POST", url, body: parsed, headers });
        const filtered = Object.keys(parsed.appliedFacets).length > 0;
        return ok({
          total: parsed.offset > 0 ? 0 : filtered ? 20 : 900,
          jobPostings: [row(filtered ? parsed.offset : 1000)],
          facets: filtered ? [] : hierarchyFacets("Canada, Toronto", 16),
        });
      },
      get: async () => ok(fixtures.detailToronto),
    };
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(
      lists(calls).map((c) => [c.body!.offset, c.body!.appliedFacets]),
    ).toEqual([
      [0, {}],
      [0, { locationHierarchy1: ["ca9"] }],
    ]);
    expect(result.completeBoards).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("picks the non-country Canada value with the largest count, not a single location record named Canada", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i));
    const { http, calls } = tenant(rows, {
      facets: hierarchyFacets("Canada", 3),
    });
    const { adapter } = make(http);

    await adapter.poll(window());

    expect(lists(calls)[1].body!.appliedFacets).toEqual({
      locationHierarchy1: ["ca9"],
    });
  });

  it("applies a Canada facet found in nested values to the walk from offset 0", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i));
    const { http, calls } = tenant(rows, {
      facets: fixtures.nestedCountryFacet,
    });
    const { adapter } = make(http);

    await adapter.poll(window());

    expect(
      lists(calls).map((c) => [c.body!.offset, c.body!.appliedFacets]),
    ).toEqual([
      [0, {}],
      [0, { Country: ["ca1"] }],
      [20, { Country: ["ca1"] }],
    ]);
  });

  it("ends a filtered walk at the filtered total", async () => {
    const calls: Call[] = [];
    const http: WorkdayHttp = {
      async post(url, body, headers) {
        const parsed = JSON.parse(body);
        calls.push({ method: "POST", url, body: parsed, headers });
        const filtered = Object.keys(parsed.appliedFacets).length > 0;
        if (filtered)
          return ok({
            total: 25,
            jobPostings: [row(parsed.offset)],
            facets: [],
          });
        return ok({
          total: 900,
          jobPostings: [row(1000)],
          facets: fixtures.nestedCountryFacet,
        });
      },
      get: async () => ok(fixtures.detailToronto),
    };
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(lists(calls).map((c) => c.body!.offset)).toEqual([0, 0, 20]);
    expect(result.completeBoards).toEqual([7]);
  });

  it.each([
    ["total 0", 0],
    ["a total under the facet's count", 3],
    ["a total over the unfiltered one", 950],
  ])(
    "walks the unfiltered total and is never complete when filtered page one gives %s",
    async (_label, filteredTotal) => {
      const calls: Call[] = [];
      const http: WorkdayHttp = {
        async post(url, body, headers) {
          const parsed = JSON.parse(body);
          calls.push({ method: "POST", url, body: parsed, headers });
          const filtered = Object.keys(parsed.appliedFacets).length > 0;
          return ok({
            total: parsed.offset > 0 ? 0 : filtered ? filteredTotal : 60,
            jobPostings: [row(filtered ? parsed.offset : 1000)],
            // The Canada value counts 7 jobs.
            facets: filtered ? [] : fixtures.nestedCountryFacet,
          });
        },
        get: async () => ok(fixtures.detailToronto),
      };
      const { adapter } = make(http);

      const result = await adapter.poll(window());

      expect(lists(calls).map((c) => c.body!.offset)).toEqual([0, 0, 20, 40]);
      expect(result.completeBoards).toEqual([]);
      expect(result.errors).toEqual([]);
    },
  );

  it("is never complete when the Canada value has no count to check the filtered total against", async () => {
    const facets = [
      {
        facetParameter: "Country",
        values: [{ descriptor: "Canada", id: "ca1" }],
      },
    ];
    const { http } = tenant([row(1)], { facets });
    const { adapter } = make(http);

    const result = await adapter.poll(window());

    expect(result.completeBoards).toEqual([]);
  });

  it("applies no filter when no Country facet holds Canada", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i));
    const { http, calls } = tenant(rows, {
      facets: [
        {
          facetParameter: "Country",
          values: [{ descriptor: "France", id: "fr" }],
        },
      ],
    });
    const { adapter } = make(http);

    await adapter.poll(window());

    expect(lists(calls).map((c) => c.body!.offset)).toEqual([0, 20]);
  });

  it.each([2000, 2001])(
    "is never complete when total is %i, since Workday reports a capped query as 2000, and warns",
    async (reported) => {
      const calls: Call[] = [];
      const http: WorkdayHttp = {
        async post(url, body, headers) {
          const parsed = JSON.parse(body);
          calls.push({ method: "POST", url, body: parsed, headers });
          return ok({
            total: parsed.offset === 0 ? reported : 0,
            jobPostings: [row(parsed.offset)],
            facets: [],
          });
        },
        get: async () => ok(fixtures.detailToronto),
      };
      const { adapter } = make(http, [{ listingKey: "workday:manulife:jr0" }]);

      const result = await adapter.poll(window());

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining(String(reported)),
      );
      expect(result.completeBoards).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(lists(calls).length).toBeLessThanOrEqual(100);
    },
  );

  it("waits 1.5 s before every request but the first", async () => {
    const { http, calls } = tenant([row(1), row(2)]);
    const { adapter, sleeps } = make(http);

    await adapter.poll(window());

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1500, 1500]);
  });

  it("sends a plain user agent and JSON headers", async () => {
    const { http, calls } = tenant([row(1)]);
    const { adapter } = make(http);

    await adapter.poll(window());

    expect(lists(calls)[0].headers).toMatchObject({
      "user-agent": "job-hunting-copilot/1.0",
      "content-type": "application/json",
    });
    expect(details(calls)[0].headers).toMatchObject({
      accept: "application/json",
    });
  });

  it("gives a fault for a slug that is not tenant.wdN/site", async () => {
    const { http, calls } = tenant([]);
    const { adapter } = make(http, [], "manulife/MFCJH_Jobs");

    const result = await adapter.poll(window());

    expect(calls).toHaveLength(0);
    expect(result.errors).toEqual([expect.objectContaining({ kind: "fault" })]);
  });

  it("gives a fault for a list body without jobPostings", async () => {
    const { adapter } = make({
      post: async () => ok({ total: 5 }),
      get: async () => ok({}),
    });

    const result = await adapter.poll(window());

    expect(result.errors).toEqual([expect.objectContaining({ kind: "fault" })]);
    expect(result.completeBoards).toEqual([]);
  });
});

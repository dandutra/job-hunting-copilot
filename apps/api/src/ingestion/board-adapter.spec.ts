import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseListingKey } from "../matching/listing-key";
import { AshbyAdapter } from "./ashby/ashby-adapter";
import { BoardAdapter, HttpClient, USER_AGENT } from "./board-adapter";
import { GreenhouseAdapter } from "./greenhouse/greenhouse-adapter";
import { LeverAdapter } from "./lever/lever-adapter";

const fixture = (dir: string) =>
  readFileSync(join(__dirname, dir, "fixtures.json"), "utf8");

const NOW = new Date("2026-11-04T12:00:00Z");
const window = (stop = () => false) => ({
  since: new Date("2026-11-04T08:30:00Z"),
  now: NOW,
  shouldStop: stop,
});

interface Case {
  ats: "greenhouse" | "lever" | "ashby";
  make: (...args: ConstructorParameters<typeof BoardAdapter>) => BoardAdapter;
  expectedUrl: (slug: string) => string;
  body: string;
  // The real board the fixture rows were trimmed from.
  slug: string;
  // The ids that survive the Search area filter, and a public URL for each.
  kept: string[];
  publicUrl: (slug: string, id: string) => string;
  empty: string;
  // Readable rows in the fixture, in or out of the area.
  listed: number;
}

const CASES: Case[] = [
  {
    ats: "greenhouse",
    make: (...a) => new GreenhouseAdapter(...a),
    expectedUrl: (s) =>
      `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
    body: fixture("greenhouse"),
    slug: "leagueinc",
    kept: ["6145664004", "6104019004"],
    publicUrl: (s, id) => `https://boards.greenhouse.io/${s}/jobs/${id}`,
    empty: '{"jobs":[]}',
    listed: 3,
  },
  {
    ats: "lever",
    make: (...a) => new LeverAdapter(...a),
    expectedUrl: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    body: fixture("lever"),
    slug: "wattpad",
    kept: [
      "a16580aa-7947-4d7b-babd-83ee6f922f0c",
      "da811487-88c8-440b-b6c2-5da90eb80ca1",
    ],
    publicUrl: (s, id) => `https://jobs.lever.co/${s}/${id}`,
    empty: "[]",
    listed: 4,
  },
  {
    ats: "ashby",
    make: (...a) => new AshbyAdapter(...a),
    expectedUrl: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    body: fixture("ashby"),
    slug: "top-hat",
    kept: [
      "a3c2849d-8a02-4156-b39c-4b1c8780bbf3",
      "24a445dc-857b-40ac-a8fc-b42c4949b0bc",
    ],
    publicUrl: (s, id) => `https://jobs.ashbyhq.com/${s}/${id}`,
    empty: '{"jobs":[]}',
    listed: 3,
  },
];

describe.each(CASES)("$ats adapter", (c) => {
  let calls: { url: string; headers: Record<string, string> }[];
  let sleeps: number[];
  let answers: Record<string, { status: number; body: string } | Error>;
  const http: HttpClient = {
    async get(url, headers) {
      calls.push({ url, headers });
      const a = answers[url];
      if (a instanceof Error) throw a;
      return a ?? { status: 500, body: "" };
    },
  };
  const companies = [
    { id: 1, name: "Acme", ats: c.ats, boardSlug: c.slug },
    { id: 2, name: "Gone", ats: c.ats, boardSlug: "gone" },
    { id: 3, name: "Beta", ats: c.ats, boardSlug: "beta" },
  ];
  let queries: unknown[];
  const prisma = {
    company: {
      findMany: async (q: unknown) => {
        queries.push(q);
        return companies;
      },
    },
  } as never;
  const adapter = () =>
    c.make(prisma, http, async (ms) => {
      sleeps.push(ms);
    });

  beforeEach(() => {
    calls = [];
    sleeps = [];
    queries = [];
    answers = {
      [c.expectedUrl(c.slug)]: { status: 200, body: c.body },
      [c.expectedUrl("gone")]: { status: 404, body: "" },
      [c.expectedUrl("beta")]: { status: 200, body: c.empty },
    };
  });

  it("maps fields to full drafts tied to the Watched company", async () => {
    const result = await adapter().poll(window());
    const drafts = result.drafts.filter((d) => d.watchedCompanyId === 1);
    expect(drafts).toHaveLength(c.kept.length);
    for (const d of drafts) {
      expect(d).toMatchObject({
        jobSource: c.ats,
        companyName: "Acme",
        descriptionKind: "full",
      });
      expect(d.title).toBeTruthy();
      expect(d.description).not.toMatch(/[<>]/);
      expect(d.reportedAt.getTime()).not.toBe(NOW.getTime());
    }
  });

  it("drops a row outside the Search area but still completes the board", async () => {
    const result = await adapter().poll(window());
    const ids = result.drafts
      .filter((d) => d.watchedCompanyId === 1)
      .map((d) => d.listingKey.split(":")[2]);
    expect(ids.sort()).toEqual([...c.kept].sort());
    expect(result.completeBoards).toContain(1);
  });

  it("reports a 404 board as a fault while other boards still finish", async () => {
    const result = await adapter().poll(window());
    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "fault",
        httpStatus: 404,
        watchedCompanyId: 2,
      }),
    ]);
    expect(result.completeBoards).toEqual([1, 3]);
    expect(result.boards).toEqual([
      expect.objectContaining({ watchedCompanyId: 1, status: "ok" }),
      { watchedCompanyId: 2, status: "failed" },
      { watchedCompanyId: 3, status: "ok", rows: 0 },
    ]);
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it.each([429, 403])("reports a %i as blocked", async (status) => {
    answers[c.expectedUrl("gone")] = { status, body: "" };
    const result = await adapter().poll(window());
    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "blocked",
        httpStatus: status,
        watchedCompanyId: 2,
      }),
    ]);
    expect(result.completeBoards).not.toContain(2);
  });

  it("does not complete a board whose body is unparseable or whose request throws", async () => {
    answers[c.expectedUrl("gone")] = { status: 200, body: "<html>" };
    answers[c.expectedUrl("beta")] = new Error("socket hang up");
    const result = await adapter().poll(window());
    expect(result.completeBoards).toEqual([1]);
    expect(result.errors.map((e) => [e.watchedCompanyId, e.kind])).toEqual([
      [2, "fault"],
      [3, "fault"],
    ]);
  });

  it("keeps a board with an unreadable row out of completeBoards", async () => {
    const rows: unknown = JSON.parse(c.body);
    const list = Array.isArray(rows)
      ? rows
      : (rows as { jobs: unknown[] }).jobs;
    list.push({ id: list.length ? (list[0] as { id: unknown }).id : 1 });
    answers[c.expectedUrl(c.slug)] = {
      status: 200,
      body: JSON.stringify(rows),
    };
    const result = await adapter().poll(window());
    expect(result.errors).toContainEqual(
      expect.objectContaining({ kind: "bad-row", watchedCompanyId: 1 }),
    );
    expect(result.completeBoards).toEqual([3]);
    expect(result.boards).toContainEqual(
      expect.objectContaining({ watchedCompanyId: 1, status: "ok" }),
    );
  });

  it("treats a row with no location as unreadable, so a lost location field closes nothing", async () => {
    answers[c.expectedUrl(c.slug)] = {
      status: 200,
      body: JSON.stringify(
        c.ats === "lever"
          ? [{ id: "5b3c1f0e-9999-4a2b-8c3d-aaaaaaaaaaaa", text: "Dev" }]
          : {
              jobs: [
                {
                  id:
                    c.ats === "greenhouse"
                      ? 9
                      : "6c4d2a1f-9999-4b3c-9d4e-aaaaaaaaaaaa",
                  title: "Dev",
                },
              ],
            },
      ),
    };
    const result = await adapter().poll(window());
    expect(result.errors).toContainEqual(
      expect.objectContaining({ kind: "bad-row", watchedCompanyId: 1 }),
    );
    expect(result.completeBoards).not.toContain(1);
  });

  it("reports how many readable rows the board listed before the Search area filter", async () => {
    const result = await adapter().poll(window());
    expect(result.boards?.[0]).toEqual({
      watchedCompanyId: 1,
      status: "ok",
      rows: c.listed,
    });
  });

  it("builds keys equal to the key listing-key parses from the public URL", async () => {
    const result = await adapter().poll(window());
    for (const d of result.drafts.filter((d) => d.watchedCompanyId === 1)) {
      const id = d.listingKey.split(":")[2];
      expect(parseListingKey(c.publicUrl(c.slug, id))).toBe(d.listingKey);
      expect(parseListingKey(d.url)).toBe(d.listingKey);
    }
  });

  it("polls Watched boards one at a time, 1 s apart, with a plain User-Agent", async () => {
    await adapter().poll(window());
    expect(queries).toEqual([
      expect.objectContaining({
        where: { ats: c.ats, boardSlug: { not: null } },
      }),
    ]);
    expect(calls.map((x) => x.url)).toEqual(
      [c.slug, "gone", "beta"].map(c.expectedUrl),
    );
    expect(sleeps).toEqual([1000, 1000]);
    expect(calls[0].headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).not.toMatch(/@/);
  });

  it("marks boards it did not reach incomplete when shutdown begins", async () => {
    let n = 0;
    const result = await adapter().poll(window(() => n++ >= 1));
    expect(result.boards).toEqual([
      expect.objectContaining({ watchedCompanyId: 1, status: "ok" }),
      { watchedCompanyId: 2, status: "incomplete" },
      { watchedCompanyId: 3, status: "incomplete" },
    ]);
    expect(result.completeBoards).toEqual([1]);
  });
});

describe("slug encoding", () => {
  it.each([
    ["PAR%20Technology", "PAR%20Technology"],
    ["PAR Technology", "PAR%20Technology"],
    ["bad%zz", "bad%25zz"],
  ])("requests slug %s as %s", async (slug, sent) => {
    const urls: string[] = [];
    const prisma = {
      company: {
        findMany: async () => [
          { id: 1, name: "Par", ats: "ashby", boardSlug: slug },
        ],
      },
    } as never;
    await new AshbyAdapter(
      prisma,
      {
        get: async (url) => {
          urls.push(url);
          return { status: 200, body: '{"jobs":[]}' };
        },
      },
      async () => {},
    ).poll(window());
    expect(urls).toEqual([
      `https://api.ashbyhq.com/posting-api/job-board/${sent}`,
    ]);
  });
});

describe("source-specific rules", () => {
  const run = async (
    adapter: (p: never, h: HttpClient, s: () => Promise<void>) => BoardAdapter,
    ats: string,
    body: string,
  ) => {
    const prisma = {
      company: {
        findMany: async () => [{ id: 1, name: "Acme", ats, boardSlug: "acme" }],
      },
    } as never;
    return adapter(
      prisma,
      { get: async () => ({ status: 200, body }) },
      async () => {},
    ).poll(window()) as Promise<import("./job-source-adapter").AdapterResult>;
  };

  it("greenhouse decodes the escaped description and splits locations on ;", async () => {
    const r = await run(
      (p, h, s) => new GreenhouseAdapter(p, h, s),
      "greenhouse",
      JSON.stringify({
        jobs: [
          {
            id: 4001,
            title: "Dev",
            location: { name: "Austin, TX; Toronto, ON" },
            content:
              "&lt;p&gt;Build &amp;amp; ship APIs.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node&lt;/li&gt;&lt;/ul&gt;",
          },
        ],
      }),
    );
    expect(r.drafts[0].description).toBe("Build & ship APIs.\nNode");
    expect(r.drafts[0].location).toBe("Austin, TX; Toronto, ON");
  });

  it("greenhouse decodes named entities such as &mdash; and &eacute;", async () => {
    const r = await run(
      (p, h, s) => new GreenhouseAdapter(p, h, s),
      "greenhouse",
      JSON.stringify({
        jobs: [
          {
            id: 7,
            title: "Dev",
            location: { name: "Toronto" },
            content:
              "&lt;p&gt;Fast&amp;mdash;caf&amp;eacute; &amp;rsquo;24&amp;hellip;&lt;/p&gt;",
          },
        ],
      }),
    );
    expect(r.drafts[0].description).toBe("Fast\u2014caf\u00e9 \u201924\u2026");
  });

  const leverRow = (over: Record<string, unknown>) =>
    JSON.stringify([
      {
        id: "5b3c1f0e-7777-4a2b-8c3d-aaaaaaaaaaaa",
        text: "Dev",
        categories: { location: "Toronto" },
        ...over,
      },
    ]);

  it("lever joins the intro, the lists and the closing into one description", async () => {
    const r = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      leverRow({
        descriptionPlain: "Intro.",
        lists: [
          { text: "What you'll do", content: "<li>Build</li><li>Ship</li>" },
          { text: "About you", content: "<li>Node</li>" },
        ],
        additionalPlain: "Benefits.",
      }),
    );
    expect(r.drafts[0].description).toBe(
      "Intro.\n\nWhat you'll do\nBuild\nShip\n\nAbout you\nNode\n\nBenefits.",
    );
    expect(r.drafts[0].descriptionKind).toBe("full");
  });

  it("lever builds a location from workplaceType and country when none is listed", async () => {
    const r = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      leverRow({
        categories: { allLocations: [] },
        workplaceType: "remote",
        country: "CA",
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.drafts[0].location).toBe("Canada; Remote, Canada");
  });

  it("lever keeps a remote row placed in Canada, and drops a hybrid one", async () => {
    const remote = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      leverRow({ categories: { location: "Canada" }, workplaceType: "remote" }),
    );
    const hybrid = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      leverRow({ categories: { location: "Canada" }, workplaceType: "hybrid" }),
    );
    expect(remote.drafts).toHaveLength(1);
    expect(hybrid.drafts).toHaveLength(0);
  });

  it("lever reads createdAt as epoch ms", async () => {
    const r = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      fixture("lever"),
    );
    expect(r.drafts[0].reportedAt).toEqual(new Date(1786545468762));
  });

  it("ashby keeps a remote row with no place as plain Remote", async () => {
    const r = await run(
      (p, h, s) => new AshbyAdapter(p, h, s),
      "ashby",
      JSON.stringify({
        jobs: [
          {
            id: "6c4d2a1f-5555-4b3c-9d4e-eeeeeeeeeeee",
            title: "Anywhere Dev",
            isRemote: true,
            isListed: true,
          },
        ],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.drafts.map((d) => d.location)).toEqual(["Remote"]);
  });

  it("ashby trusts workplaceType over isRemote, which hybrid roles also set", async () => {
    const row = (workplaceType: string | undefined) =>
      JSON.stringify({
        jobs: [
          {
            id: "6c4d2a1f-6666-4b3c-9d4e-ffffffffffff",
            title: "Dev",
            location: "Canada",
            isRemote: true,
            isListed: true,
            ...(workplaceType ? { workplaceType } : {}),
          },
        ],
      });
    const ashby = (body: string) =>
      run((p, h, s) => new AshbyAdapter(p, h, s), "ashby", body);
    expect((await ashby(row("Hybrid"))).drafts).toHaveLength(0);
    expect((await ashby(row("Remote"))).drafts).toHaveLength(1);
    expect((await ashby(row(undefined))).drafts).toHaveLength(1);
  });

  it("ashby skips unlisted rows without an error", async () => {
    const r = await run(
      (p, h, s) => new AshbyAdapter(p, h, s),
      "ashby",
      JSON.stringify({
        jobs: [
          {
            id: "6c4d2a1f-1111-4b3c-9d4e-aaaaaaaaaaaa",
            title: "Full Stack Developer",
            location: "Toronto, Canada",
            secondaryLocations: [{ location: "Vancouver, Canada" }],
            isListed: true,
          },
          {
            id: "6c4d2a1f-3333-4b3c-9d4e-cccccccccccc",
            title: "Hidden Role",
            location: "Toronto, Canada",
            isListed: false,
          },
        ],
      }),
    );
    expect(r.drafts.map((d) => d.title)).toEqual(["Full Stack Developer"]);
    expect(r.errors).toEqual([]);
    expect(r.drafts[0].location).toBe("Toronto, Canada; Vancouver, Canada");
  });
});

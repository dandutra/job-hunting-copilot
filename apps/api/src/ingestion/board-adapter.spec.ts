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
  // The ids that survive the Search area filter, and a public URL for each.
  kept: string[];
  publicUrl: (slug: string, id: string) => string;
  empty: string;
}

const CASES: Case[] = [
  {
    ats: "greenhouse",
    make: (...a) => new GreenhouseAdapter(...a),
    expectedUrl: (s) =>
      `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
    body: fixture("greenhouse"),
    kept: ["4001"],
    publicUrl: (s, id) => `https://boards.greenhouse.io/${s}/jobs/${id}`,
    empty: '{"jobs":[]}',
  },
  {
    ats: "lever",
    make: (...a) => new LeverAdapter(...a),
    expectedUrl: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    body: fixture("lever"),
    kept: [
      "5b3c1f0e-1111-4a2b-8c3d-aaaaaaaaaaaa",
      "5b3c1f0e-3333-4a2b-8c3d-cccccccccccc",
    ],
    publicUrl: (s, id) => `https://jobs.lever.co/${s}/${id}`,
    empty: "[]",
  },
  {
    ats: "ashby",
    make: (...a) => new AshbyAdapter(...a),
    expectedUrl: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    body: fixture("ashby"),
    kept: [
      "6c4d2a1f-1111-4b3c-9d4e-aaaaaaaaaaaa",
      "6c4d2a1f-2222-4b3c-9d4e-bbbbbbbbbbbb",
    ],
    publicUrl: (s, id) => `https://jobs.ashbyhq.com/${s}/${id}`,
    empty: '{"jobs":[]}',
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
    { id: 1, name: "Acme", ats: c.ats, boardSlug: "acme" },
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
      [c.expectedUrl("acme")]: { status: 200, body: c.body },
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
    answers[c.expectedUrl("acme")] = {
      status: 200,
      body: JSON.stringify(rows),
    };
    const result = await adapter().poll(window());
    expect(result.errors).toContainEqual(
      expect.objectContaining({ kind: "bad-row", watchedCompanyId: 1 }),
    );
    expect(result.completeBoards).toEqual([3]);
    expect(result.boards).toContainEqual({
      watchedCompanyId: 1,
      status: "ok",
      rows: list.length,
    });
  });

  it("reports how many rows the board listed before the Search area filter", async () => {
    const result = await adapter().poll(window());
    const parsed: unknown = JSON.parse(c.body);
    const total = (
      Array.isArray(parsed) ? parsed : (parsed as { jobs: unknown[] }).jobs
    ).length;
    expect(result.boards?.[0]).toEqual({
      watchedCompanyId: 1,
      status: "ok",
      rows: total,
    });
  });

  it("builds keys equal to the key listing-key parses from the public URL", async () => {
    const result = await adapter().poll(window());
    for (const d of result.drafts.filter((d) => d.watchedCompanyId === 1)) {
      const id = d.listingKey.split(":")[2];
      expect(parseListingKey(c.publicUrl("acme", id))).toBe(d.listingKey);
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
      ["acme", "gone", "beta"].map(c.expectedUrl),
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
      fixture("greenhouse"),
    );
    expect(r.drafts[0].description).toBe("Build & ship APIs.\nNode");
    expect(r.drafts[0].location).toBe("Toronto, ON; Remote - Canada");
  });

  it("lever reads createdAt as epoch ms", async () => {
    const r = await run(
      (p, h, s) => new LeverAdapter(p, h, s),
      "lever",
      fixture("lever"),
    );
    expect(r.drafts[0].reportedAt).toEqual(new Date(1760000000000));
  });

  it("ashby skips unlisted rows without an error", async () => {
    const r = await run(
      (p, h, s) => new AshbyAdapter(p, h, s),
      "ashby",
      fixture("ashby"),
    );
    expect(r.drafts.map((d) => d.title)).not.toContain("Hidden Role");
    expect(r.errors).toEqual([]);
    expect(
      r.drafts.find((d) => d.title === "Full Stack Developer")?.location,
    ).toBe("Toronto, Canada; Vancouver, Canada");
  });
});

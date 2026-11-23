import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { parseListingKey } from "../../matching/listing-key";
import { HttpClient, HttpResponse, USER_AGENT } from "../board-adapter";
import { SmartRecruitersAdapter } from "./smartrecruiters-adapter";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "fixtures.json"), "utf8"),
);

const NOW = new Date("2026-11-23T12:00:00Z");
const window = (stop = () => false) => ({
  since: new Date("2026-11-23T08:00:00Z"),
  now: NOW,
  shouldStop: stop,
});

const API = "https://api.smartrecruiters.com/v1/companies/Ubisoft2/postings";
const listUrl = (offset: number) => `${API}?limit=100&offset=${offset}`;
const ok = (json: unknown): HttpResponse => ({
  status: 200,
  body: JSON.stringify(json),
});

// The recorded rows: two in Toronto, one in Montreal, one remote from Montreal. Their real titles fail the Title filter, so the rows that need a detail call are renamed.
const [toronto1, toronto2, montreal, montrealRemote] = (
  fixtures.page.content as Record<string, unknown>[]
).map((r): Record<string, unknown> => ({ ...r, name: "Software Developer" }));

function torontoRow(n: number) {
  return {
    ...toronto1,
    id: String(n),
    ref: `${API}/${n}`,
    location: { ...(toronto1.location as object) },
  };
}

// A board that serves `rows` in pages of 100 and answers every detail call with the recorded Toronto detail.
function board(
  rows: unknown[],
  answers: Record<string, HttpResponse | Error> = {},
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpClient = {
    async get(url, headers) {
      calls.push({ url, headers });
      const answer = answers[url];
      if (answer instanceof Error) throw answer;
      if (answer) return answer;
      if (url.startsWith(`${API}?`)) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        return ok({
          offset,
          limit: 100,
          totalFound: rows.length,
          content: rows.slice(offset, offset + 100),
        });
      }
      return ok(fixtures.detailToronto);
    },
  };
  return { http, calls };
}

const lists = <T extends { url: string }>(calls: T[]) =>
  calls.filter((c) => c.url.startsWith(`${API}?`));
const details = <T extends { url: string }>(calls: T[]) =>
  calls.filter((c) => !c.url.startsWith(`${API}?`));

function make(http: HttpClient, stored: Record<string, unknown>[] = []) {
  const sleeps: number[] = [];
  const findMany = jest.fn(
    async (args: {
      where: { listingKey: { in: string[] }; lastSeenAt: { gte: Date } };
    }) =>
      stored.filter(
        (s) =>
          args.where.listingKey.in.includes(s.listingKey as string) &&
          ((s.lastSeenAt as Date | undefined) ?? NOW) >=
            args.where.lastSeenAt.gte,
      ),
  );
  const adapter = new SmartRecruitersAdapter(
    {
      company: {
        findMany: async () => [
          {
            id: 9,
            name: "Ubisoft",
            ats: "smartrecruiters",
            boardSlug: "Ubisoft2",
          },
        ],
      },
      sighting: { findMany },
    } as unknown as ConstructorParameters<typeof SmartRecruitersAdapter>[0],
    http,
    async (ms) => {
      sleeps.push(ms);
    },
  );
  return { adapter, sleeps, findMany };
}

describe("SmartRecruitersAdapter", () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    log = jest.spyOn(Logger.prototype, "log").mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it("polls every hour", () => {
    expect(make(board([]).http).adapter.minIntervalMs).toBe(3600_000);
  });

  it("takes 2 list calls for 130 rows, 1 s apart, and stops at totalFound", async () => {
    const { http, calls } = board(
      Array.from({ length: 130 }, (_, i) => torontoRow(i + 1)),
    );
    const { adapter, sleeps } = make(http);
    const result = await adapter.poll(window());

    expect(lists(calls).map((c) => c.url)).toEqual([listUrl(0), listUrl(100)]);
    expect(lists(calls)[0].headers).toMatchObject({
      "user-agent": USER_AGENT,
      accept: "application/json",
    });
    expect(result.boards).toEqual([
      { watchedCompanyId: 9, status: "ok", rows: 130 },
    ]);
    expect(result.completeBoards).toEqual([9]);
    // Every request after the first waits 1 s: 2 list calls and 130 detail calls.
    expect(sleeps).toEqual(Array(131).fill(1000));
  });

  it("takes one list call for exactly 100 rows", async () => {
    const { http, calls } = board(
      Array.from({ length: 100 }, (_, i) => torontoRow(i + 1)),
    );
    await make(http).adapter.poll(window());
    expect(lists(calls)).toHaveLength(1);
  });

  it("makes no detail call for a key that has a stored Sighting, and keeps the stored fields under the list title", async () => {
    const { http, calls } = board([toronto1]);
    const { adapter, findMany } = make(http, [
      {
        listingKey: "smartrecruiters:ubisoft2:744000163253566",
        url: "https://jobs.smartrecruiters.com/Ubisoft2/744000163253566-old",
        reportedAt: new Date("2026-11-20T00:00:00Z"),
        title: "Old title",
        location: "Toronto, ON, Canada",
        description: "Stored text",
        descriptionKind: "full",
      },
    ]);
    const result = await adapter.poll(window());

    expect(details(calls)).toHaveLength(0);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.drafts).toEqual([
      expect.objectContaining({
        listingKey: "smartrecruiters:ubisoft2:744000163253566",
        title: "Software Developer",
        description: "Stored text",
        reportedAt: new Date("2026-11-20T00:00:00Z"),
      }),
    ]);
  });

  it("drops an out-of-area row without a detail call", async () => {
    const { http, calls } = board([montreal]);
    const result = await make(http).adapter.poll(window());

    expect(details(calls)).toHaveLength(0);
    expect(result.drafts).toEqual([]);
    expect(result.boards).toEqual([
      { watchedCompanyId: 9, status: "ok", rows: 1 },
    ]);
    // The board was read in full, so its jobs that left the area can close.
    expect(result.completeBoards).toEqual([9]);
  });

  it("builds a full draft from the detail call for an in-area row with no stored Sighting", async () => {
    const { http, calls } = board([toronto1, montreal, montrealRemote]);
    const result = await make(http).adapter.poll(window());

    expect(details(calls).map((c) => c.url)).toEqual([
      `${API}/744000163253566`,
      `${API}/744000159658729`,
    ]);
    const [draft] = result.drafts;
    expect(draft).toMatchObject({
      jobSource: "smartrecruiters",
      listingKey: "smartrecruiters:ubisoft2:744000163253566",
      url: "https://jobs.smartrecruiters.com/Ubisoft2/744000163253566-senior-level-artist-splinter-cell-remake-",
      reportedAt: new Date("2026-11-23T15:24:15.731Z"),
      companyName: "Ubisoft",
      title: "Software Developer",
      location: "Toronto, ON, Canada",
      descriptionKind: "full",
      watchedCompanyId: 9,
    });
    expect(draft.description).not.toMatch(/[<>]/);
    // All four sections are joined, in the order SmartRecruiters shows them, not only the job description.
    const at = (text: string) => draft.description.indexOf(text);
    expect(at("Ubisoft est une référence")).toBeGreaterThanOrEqual(0);
    expect(at("Senior Level Artist at Ubisoft Toronto")).toBeGreaterThan(
      at("Ubisoft est une référence"),
    );
    expect(at("What you bring to the team")).toBeGreaterThan(
      at("Senior Level Artist at Ubisoft Toronto"),
    );
    expect(at("existing vacancy")).toBeGreaterThan(
      at("What you bring to the team"),
    );
    expect(parseListingKey(draft.url)).toBe(draft.listingKey);
  });

  it("keeps a remote row from a Canadian place, because 'remote' plus Canada is in the Search area", async () => {
    const { http } = board([montrealRemote]);
    const result = await make(http).adapter.poll(window());
    expect(result.drafts.map((d) => d.listingKey)).toEqual([
      "smartrecruiters:ubisoft2:744000159658729",
    ]);
  });

  it("keeps the stored description but takes the location from the current row", async () => {
    const { http } = board([montrealRemote]);
    const { adapter } = make(http, [
      {
        listingKey: "smartrecruiters:ubisoft2:744000159658729",
        url: "https://jobs.smartrecruiters.com/Ubisoft2/744000159658729-cg",
        reportedAt: new Date("2026-11-04T00:00:00Z"),
        title: "CG Supervisor",
        location: "Toronto, ON, Canada",
        description: "Stored text",
        descriptionKind: "full",
      },
    ]);
    const result = await adapter.poll(window());

    expect(result.drafts).toEqual([
      expect.objectContaining({
        location: "Montreal, QC, Canada; Remote, Montreal, QC, Canada",
        description: "Stored text",
      }),
    ]);
  });

  it("makes no detail call for a title the Title filter drops, so the call is not repeated every hour", async () => {
    const failing = {
      ...toronto2,
      name: "Sr Community Developer - Splinter Cell",
    };
    const { http, calls } = board([failing, toronto1]);
    const result = await make(http).adapter.poll(window());

    expect(details(calls).map((c) => c.url)).toEqual([
      `${API}/744000163253566`,
    ]);
    expect(result.drafts).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      "Ubisoft: dropped 1 of 2 rows by title before the detail call",
    );
    // The row is still listed, so the board is read in full.
    expect(result.boards).toEqual([
      { watchedCompanyId: 9, status: "ok", rows: 2 },
    ]);
    expect(result.completeBoards).toEqual([9]);
  });

  it("warns when a 200 listing is empty and reports no rows", async () => {
    const { http } = board([], { [listUrl(0)]: ok(fixtures.unknownCompany) });
    const result = await make(http).adapter.poll(window());

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("0 jobs"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Ubisoft"));
    expect(result.boards).toEqual([
      { watchedCompanyId: 9, status: "ok", rows: 0 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("does not warn for a non-empty board", async () => {
    const { http } = board([montreal]);
    await make(http).adapter.poll(window());
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([429, 403])("reports a %i on the list as blocked", async (status) => {
    const { http } = board([], { [listUrl(0)]: { status, body: "" } });
    const result = await make(http).adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: "blocked",
        httpStatus: status,
        watchedCompanyId: 9,
      }),
    ]);
    expect(result.boards).toEqual([{ watchedCompanyId: 9, status: "failed" }]);
    expect(result.completeBoards).toEqual([]);
  });

  it("reports a 429 on a detail call as blocked and keeps the board incomplete", async () => {
    const { http } = board([toronto1], {
      [`${API}/744000163253566`]: { status: 429, body: "" },
    });
    const result = await make(http).adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "blocked", httpStatus: 429 }),
    ]);
    expect(result.completeBoards).toEqual([]);
  });

  it.each([
    ["a 500", { status: 500, body: "" }],
    ["a body that is not JSON", { status: 200, body: "<html>" }],
    ["a body with no content list", ok({ totalFound: 3 })],
    ["a body with no totalFound", ok({ content: [] })],
    ["a thrown request", new Error("socket hang up")],
  ])("reports %s on the list as a fault", async (_name, answer) => {
    const { http } = board([], { [listUrl(0)]: answer });
    const result = await make(http).adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "fault", watchedCompanyId: 9 }),
    ]);
    expect(result.completeBoards).toEqual([]);
  });

  it("keeps a board with a failed second page out of completeBoards", async () => {
    const { http } = board(
      Array.from({ length: 130 }, (_, i) => torontoRow(i + 1)),
      { [listUrl(100)]: { status: 500, body: "" } },
    );
    const result = await make(http).adapter.poll(window());

    expect(result.errors).toEqual([
      expect.objectContaining({ kind: "fault", httpStatus: 500 }),
    ]);
    expect(result.completeBoards).toEqual([]);
    expect(result.boards).toEqual([{ watchedCompanyId: 9, status: "failed" }]);
  });

  it("makes a row with no id, no location or a missing detail a bad-row and keeps the board incomplete", async () => {
    const noId = { ...toronto1, id: undefined };
    const noPlace = { ...toronto2, location: {} };
    const { http } = board([noId, noPlace, toronto1], {
      [`${API}/744000163253566`]: { status: 404, body: "" },
    });
    const result = await make(http).adapter.poll(window());

    expect(result.errors.map((e) => e.kind)).toEqual([
      "bad-row",
      "bad-row",
      "bad-row",
    ]);
    const messages = result.errors.map((e) => e.message).join("\n");
    expect(messages).toContain("id is missing");
    expect(messages).toContain("location is missing");
    expect(messages).toContain("detail call answered 404");
    expect(result.drafts).toEqual([]);
    expect(result.completeBoards).toEqual([]);
  });

  it("reads a row repeated across pages once", async () => {
    const { http } = board(
      Array.from({ length: 130 }, (_, i) => torontoRow(i + 1)),
      {
        [listUrl(100)]: ok({
          offset: 100,
          limit: 100,
          totalFound: 130,
          content: [
            torontoRow(100),
            ...Array.from({ length: 30 }, (_, i) => torontoRow(i + 101)),
          ],
        }),
      },
    );
    const result = await make(http).adapter.poll(window());
    expect(result.drafts).toHaveLength(130);
  });

  it("reports the board incomplete when shutdown begins", async () => {
    const { http, calls } = board([toronto1]);
    const result = await make(http).adapter.poll(window(() => true));

    expect(calls).toEqual([]);
    expect(result.boards).toEqual([
      { watchedCompanyId: 9, status: "incomplete" },
    ]);
    expect(result.completeBoards).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

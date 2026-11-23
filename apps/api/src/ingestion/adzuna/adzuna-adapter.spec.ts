import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { Alert, AlertHook } from "../alert-hook";
import { HttpClient, HttpResponse } from "../board-adapter";
import {
  AdzunaAdapter,
  AdzunaConfig,
  adzunaConfigFromEnv,
  MAX_PAGES,
  RESULTS_PER_PAGE,
} from "./adzuna-adapter";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "fixtures.json"), "utf8"),
);

const NOW = new Date("2026-11-23T12:00:00Z");
const window = (stop = () => false) => ({
  since: new Date("2026-11-23T08:00:00Z"),
  now: NOW,
  shouldStop: stop,
});

const CONFIG: AdzunaConfig = {
  appId: "test-id",
  appKey: "secret-key-value",
  what: "software developer",
};

// `n` copies of a fixture row, each with its own id.
const rows = (n: number, from = fixtures.toronto, start = 1) =>
  Array.from({ length: n }, (_, i) => ({ ...from, id: String(start + i) }));

const ok = (results: unknown[]): HttpResponse => ({
  status: 200,
  body: JSON.stringify({ count: results.length, mean: 90000, results }),
});

// Serves one response per call, in order, and records every URL it was asked for.
function server(...responses: (HttpResponse | Error)[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpClient = {
    async get(url, headers) {
      calls.push({ url, headers });
      const next = responses[calls.length - 1];
      if (!next) throw new Error(`unexpected call ${calls.length}`);
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { http, calls };
}

describe("AdzunaAdapter", () => {
  let alerts: Alert[];
  const alertHook: AlertHook = {
    alert: async (a) => {
      alerts.push(a);
    },
  };
  const make = (http: HttpClient, config: Partial<AdzunaConfig> = {}) =>
    new AdzunaAdapter({ ...CONFIG, ...config }, alertHook, http);
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    alerts = [];
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    log = jest.spyOn(Logger.prototype, "log").mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it("polls every hour", () => {
    expect(make(server().http).minIntervalMs).toBe(3600_000);
  });

  it("takes 2 calls for a full page of 50 and a short page of 12", async () => {
    const { http, calls } = server(
      ok(rows(RESULTS_PER_PAGE)),
      ok(rows(12, fixtures.toronto, 100)),
    );

    const result = await make(http).poll(window());

    expect(calls).toHaveLength(2);
    expect(result.drafts).toHaveLength(62);
    expect(result.errors).toEqual([]);
    expect(result.completeBoards).toEqual([]);
  });

  it("stops at the page cap although every page is full", async () => {
    const { http, calls } = server(
      ...Array.from({ length: MAX_PAGES + 1 }, (_, p) =>
        ok(rows(RESULTS_PER_PAGE, fixtures.toronto, p * 1000)),
      ),
    );

    const result = await make(http).poll(window());

    expect(MAX_PAGES).toBe(3);
    expect(calls).toHaveLength(3);
    expect(result.drafts).toHaveLength(150);
  });

  it("counts a short page by its raw rows, before the Search area filter", async () => {
    const full = [
      ...rows(RESULTS_PER_PAGE - 1),
      { ...fixtures.ottawa, id: "out" },
    ];
    const { http, calls } = server(ok(full), ok([]));

    const result = await make(http).poll(window());

    // 49 kept plus 1 dropped is a full page, so page 2 is asked for.
    expect(calls).toHaveLength(2);
    expect(result.drafts).toHaveLength(RESULTS_PER_PAGE - 1);
  });

  it("asks for Toronto, newest first, two days back, with the keys", async () => {
    const { http, calls } = server(ok([]));

    await make(http).poll(window());

    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(
      "https://api.adzuna.com/v1/api/jobs/ca/search/1",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app_id: "test-id",
      app_key: "secret-key-value",
      what: "software developer",
      where: "Toronto",
      max_days_old: "2",
      sort_by: "date",
      results_per_page: "50",
    });
    expect(calls[0].headers.accept).toBe("application/json");
  });

  it("pages by number in the path", async () => {
    const { http, calls } = server(ok(rows(RESULTS_PER_PAGE)), ok([]));

    await make(http).poll(window());

    expect(new URL(calls[1].url).pathname).toBe("/v1/api/jobs/ca/search/2");
  });

  it("sends the configured search words", async () => {
    const { http, calls } = server(ok([]));

    await make(http, { what: "ai engineer" }).poll(window());

    expect(new URL(calls[0].url).searchParams.get("what")).toBe("ai engineer");
  });

  it("drops a row outside the Search area and keeps the rest", async () => {
    const { http } = server(
      ok([fixtures.toronto, fixtures.ottawa, fixtures.mississauga]),
    );

    const result = await make(http).poll(window());

    expect(result.drafts.map((d) => d.listingKey)).toEqual([
      "adzuna:4871120031",
      "adzuna:4871120555",
    ]);
    expect(result.errors).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "adzuna: dropped 1 of 3 rows outside the Search area",
    );
  });

  it("keeps a remote row open to Canada", async () => {
    const remote = {
      ...fixtures.ottawa,
      id: "remote-1",
      location: {
        display_name: "Remote, Canada",
        area: ["Canada"],
      },
    };
    const { http } = server(ok([remote]));

    const result = await make(http).poll(window());

    expect(result.drafts).toHaveLength(1);
  });

  it("makes a snippet draft with no directUrl", async () => {
    const { http } = server(ok([fixtures.toronto]));

    const result = await make(http).poll(window());

    expect(result.drafts).toEqual([
      {
        jobSource: "adzuna",
        listingKey: "adzuna:4871120031",
        url: fixtures.toronto.redirect_url,
        reportedAt: new Date("2026-11-22T14:03:11Z"),
        companyName: "Northwind Systems",
        title: "Software Developer",
        location: "Toronto, Ontario",
        description: fixtures.toronto.description,
        descriptionKind: "snippet",
      },
    ]);
    expect(result.drafts[0]).not.toHaveProperty("directUrl");
  });

  it("never parses the redirect URL for a key", async () => {
    // A tracking link carries ids of its own; the key stays the Adzuna id.
    const row = {
      ...fixtures.toronto,
      id: "777",
      redirect_url: "https://www.adzuna.ca/land/ad/999?v=1",
    };
    const { http } = server(ok([row]));

    const result = await make(http).poll(window());

    expect(result.drafts[0].listingKey).toBe("adzuna:777");
    expect(result.drafts[0].url).toBe("https://www.adzuna.ca/land/ad/999?v=1");
  });

  it("accepts a numeric id", async () => {
    const { http } = server(ok([{ ...fixtures.toronto, id: 4871120031 }]));

    const result = await make(http).poll(window());

    expect(result.drafts[0].listingKey).toBe("adzuna:4871120031");
  });

  it("reads a blank description as none", async () => {
    const { http } = server(ok([{ ...fixtures.toronto, description: " " }]));

    const result = await make(http).poll(window());

    expect(result.drafts[0].descriptionKind).toBe("none");
    expect(result.drafts[0].description).toBe("");
  });

  it("falls back to now when created is missing or unreadable", async () => {
    const { http } = server(
      ok([
        { ...fixtures.toronto, id: "a", created: undefined },
        { ...fixtures.toronto, id: "b", created: "yesterday-ish" },
      ]),
    );

    const result = await make(http).poll(window());

    expect(result.drafts.map((d) => d.reportedAt)).toEqual([NOW, NOW]);
  });

  describe("without a key", () => {
    it.each([
      ["app id", { appId: null }],
      ["app key", { appKey: null }],
    ])("makes no calls and reports no error with no %s", async (_n, over) => {
      const { http, calls } = server();

      const result = await make(http, over).poll(window());

      expect(calls).toEqual([]);
      expect(result).toEqual({ drafts: [], errors: [], completeBoards: [] });
      expect(alerts).toEqual([]);
    });

    it("logs once at startup, not on every poll", async () => {
      const { http } = server();
      const adapter = make(http, { appId: null, appKey: null });

      await adapter.poll(window());
      await adapter.poll(window());

      const said = warn.mock.calls.filter(([m]) =>
        String(m).includes("ADZUNA_APP_ID"),
      );
      expect(said).toHaveLength(1);
    });

    it("does not log when the keys are set", () => {
      make(server().http);

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("failures", () => {
    it.each([401, 429])(
      "reports a %s as blocked and alerts",
      async (status) => {
        const { http } = server({ status, body: "" });

        const result = await make(http).poll(window());

        expect(result.drafts).toEqual([]);
        expect(result.errors).toEqual([
          { kind: "blocked", message: `adzuna answered ${status}` },
        ]);
        expect(alerts).toEqual([
          {
            kind: "blocked",
            adapter: "adzuna",
            message: `adzuna answered ${status}`,
          },
        ]);
      },
    );

    it("reports any other status as a fault", async () => {
      const { http } = server({ status: 500, body: "" });

      const result = await make(http).poll(window());

      expect(result.errors).toEqual([
        { kind: "fault", message: "adzuna answered 500" },
      ]);
      expect(alerts[0].kind).toBe("fault");
    });

    it("reports a network error as a fault without the key in it", async () => {
      const cause = new Error("connect ECONNREFUSED");
      const { http } = server(
        Object.assign(new Error("fetch failed"), { cause }),
      );

      const result = await make(http).poll(window());

      expect(result.errors[0].kind).toBe("fault");
      expect(result.errors[0].message).toContain("ECONNREFUSED");
      expect(JSON.stringify([result, alerts])).not.toContain(CONFIG.appKey);
    });

    it("reports a body that is not the search shape as a fault", async () => {
      const { http } = server(
        { status: 200, body: "<html>maintenance</html>" },
        { status: 200, body: JSON.stringify({ results: "none" }) },
      );

      const first = await make(http).poll(window());
      const second = await make(http).poll(window());

      expect(first.errors[0].kind).toBe("fault");
      expect(second.errors[0].kind).toBe("fault");
    });

    it("keeps page 1's drafts when page 2 is refused", async () => {
      const { http, calls } = server(ok(rows(RESULTS_PER_PAGE)), {
        status: 429,
        body: "",
      });

      const result = await make(http).poll(window());

      expect(calls).toHaveLength(2);
      expect(result.drafts).toHaveLength(RESULTS_PER_PAGE);
      expect(result.errors.map((e) => e.kind)).toEqual(["blocked"]);
    });

    it("skips a row with no id, title, company or link as a bad-row", async () => {
      const bad = [
        { ...fixtures.toronto, id: undefined },
        { ...fixtures.toronto, id: "2", title: " " },
        { ...fixtures.toronto, id: "3", company: {} },
        { ...fixtures.toronto, id: "4", redirect_url: undefined },
      ];
      const { http } = server(ok([...bad, fixtures.mississauga]));

      const result = await make(http).poll(window());

      expect(result.drafts.map((d) => d.listingKey)).toEqual([
        "adzuna:4871120555",
      ]);
      expect(result.errors.map((e) => e.kind)).toEqual([
        "bad-row",
        "bad-row",
        "bad-row",
        "bad-row",
      ]);
      expect(result.errors[0].message).toContain("id");
      expect(alerts).toEqual([]);
    });

    it("skips a row with no location as a bad-row, not as out of area", async () => {
      const { http } = server(
        ok([{ ...fixtures.toronto, id: "5", location: {} }]),
      );

      const result = await make(http).poll(window());

      expect(result.drafts).toEqual([]);
      expect(result.errors.map((e) => e.kind)).toEqual(["bad-row"]);
    });
  });

  it("returns what it has when shutdown begins between pages", async () => {
    let stop = false;
    const { http, calls } = server(ok(rows(RESULTS_PER_PAGE)));
    const original = http.get.bind(http);
    http.get = async (url, headers) => {
      const res = await original(url, headers);
      stop = true;
      return res;
    };

    const result = await make(http).poll(window(() => stop));

    expect(calls).toHaveLength(1);
    expect(result.drafts).toHaveLength(RESULTS_PER_PAGE);
    expect(result.errors).toEqual([]);
  });
});

describe("adzunaConfigFromEnv", () => {
  it("reads the keys and the search words", () => {
    expect(
      adzunaConfigFromEnv({
        ADZUNA_APP_ID: " abc ",
        ADZUNA_APP_KEY: "def",
        ADZUNA_WHAT: "ai engineer",
      }),
    ).toEqual({ appId: "abc", appKey: "def", what: "ai engineer" });
  });

  it("treats blank values as unset, because Compose passes an unset variable as an empty string", () => {
    expect(
      adzunaConfigFromEnv({
        ADZUNA_APP_ID: "",
        ADZUNA_APP_KEY: "  ",
        ADZUNA_WHAT: "",
      }),
    ).toEqual({ appId: null, appKey: null, what: "software developer" });
    expect(adzunaConfigFromEnv({})).toEqual({
      appId: null,
      appKey: null,
      what: "software developer",
    });
  });
});

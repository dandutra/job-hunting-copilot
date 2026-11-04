import { readFileSync } from "node:fs";
import { createServer, IncomingMessage, Server } from "node:http";
import { AddressInfo } from "node:net";
import { join } from "node:path";
import { Alert, AlertHook } from "../alert-hook";
import { JobspyAdapter, JobspyConfig } from "./jobspy-adapter";

const FIXTURES = join(__dirname, "../../../../jobspy/tests/fixtures");
const rows = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

const NOW = new Date("2026-11-04T12:00:00Z");
const window = { since: new Date("2026-11-04T08:30:00Z"), now: NOW };

describe("JobspyAdapter", () => {
  let server: Server;
  let baseUrl: string;
  let respond: (
    req: IncomingMessage,
    body: string,
  ) => Promise<[number, unknown]>;
  let requests: { url?: string; body: string }[];
  let alerts: Alert[];
  const alertHook: AlertHook = {
    alert: async (a) => {
      alerts.push(a);
    },
  };

  const adapter = (
    over: Partial<JobspyConfig> = {},
    site: JobspyConfig["site"] = "indeed",
  ) =>
    new JobspyAdapter(
      {
        baseUrl,
        site,
        searchTerm: "software developer",
        location: "Canada",
        resultsWanted: 50,
        timeoutMs: 5_000,
        ...over,
      },
      alertHook,
    );

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        requests.push({ url: req.url, body });
        const [status, json] = await respond(req, body);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    requests = [];
    alerts = [];
    respond = async () => [200, { rows: [], errors: {} }];
  });

  it("asks for the window in whole hours, rounded up", async () => {
    await adapter().poll(window);

    expect(requests[0].url).toBe("/scrape");
    expect(JSON.parse(requests[0].body)).toEqual({
      site: "indeed",
      search_term: "software developer",
      location: "Canada",
      hours_old: 4,
      results_wanted: 50,
    });
  });

  it("maps an Indeed row to a draft with the direct URL", async () => {
    respond = async () => [200, { rows: rows("indeed_rows.json"), errors: {} }];

    const { drafts, errors } = await adapter().poll(window);

    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      {
        jobSource: "jobspy-indeed",
        listingKey: "indeed:9ed1c4e22c77bcfb",
        url: "https://ca.indeed.com/viewjob?jk=9ed1c4e22c77bcfb",
        reportedAt: new Date("2026-10-29T00:00:00Z"),
        companyName: "Deloitte",
        title: "Junior Software Engineer",
        location: "Toronto, ON, Canada",
        description: "",
        descriptionKind: "none",
        directUrl:
          "https://careers.deloitte.ca/job/Junior-Software-Engineer/133892-en_US",
      },
    ]);
  });

  it("maps a LinkedIn row and treats a present description as full", async () => {
    const [row] = rows("linkedin_rows.json");
    respond = async () => [
      200,
      { rows: [{ ...row, description: "Build things." }], errors: {} },
    ];

    const { drafts } = await adapter({}, "linkedin").poll(window);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      jobSource: "jobspy-linkedin",
      listingKey: "linkedin:4484496029",
      description: "Build things.",
      descriptionKind: "full",
    });
    expect(drafts[0].directUrl).toBeUndefined();
  });

  it("dates a row without a date_posted at the poll time", async () => {
    const [row] = rows("indeed_rows.json");
    respond = async () => [
      200,
      { rows: [{ ...row, date_posted: null }], errors: {} },
    ];

    const { drafts } = await adapter().poll(window);

    expect(drafts[0].reportedAt).toEqual(NOW);
  });

  it("reports a row it cannot map as a bad-row error and keeps the rest", async () => {
    const [row] = rows("indeed_rows.json");
    respond = async () => [
      200,
      { rows: [{ ...row, id: null }, row], errors: {} },
    ];

    const { drafts, errors } = await adapter().poll(window);

    expect(drafts).toHaveLength(1);
    expect(errors).toEqual([
      { kind: "bad-row", message: expect.stringContaining("id") },
    ]);
    expect(alerts).toEqual([]);
  });

  it("raises a blocked alert for an entry in errors and still returns the rows", async () => {
    respond = async () => [
      200,
      {
        rows: rows("indeed_rows.json"),
        errors: { indeed: "429 too many requests (blocked: use a proxy)" },
      },
    ];

    const { drafts, errors } = await adapter().poll(window);

    expect(drafts).toHaveLength(1);
    expect(errors).toEqual([
      { kind: "blocked", message: expect.stringContaining("429") },
    ]);
    expect(alerts).toEqual([
      {
        kind: "blocked",
        adapter: "jobspy-indeed",
        message: expect.stringContaining("indeed"),
      },
    ]);
  });

  it("raises a fault alert for a 500 and returns no drafts", async () => {
    respond = async () => [500, { detail: "boom" }];

    const { drafts, errors } = await adapter().poll(window);

    expect(drafts).toEqual([]);
    expect(errors).toEqual([
      { kind: "fault", message: expect.stringContaining("500") },
    ]);
    expect(alerts).toEqual([
      expect.objectContaining({ kind: "fault", adapter: "jobspy-indeed" }),
    ]);
  });

  it("raises a fault alert when the scraper does not answer in time", async () => {
    respond = () => new Promise(() => undefined);

    const { drafts, errors } = await adapter({ timeoutMs: 100 }).poll(window);

    expect(drafts).toEqual([]);
    expect(errors).toEqual([
      { kind: "fault", message: expect.stringContaining("timed out") },
    ]);
    expect(alerts).toEqual([expect.objectContaining({ kind: "fault" })]);
  });

  it("raises a fault alert when the scraper cannot be reached", async () => {
    const { errors } = await adapter({ baseUrl: "http://127.0.0.1:1" }).poll(
      window,
    );

    expect(errors).toEqual([{ kind: "fault", message: expect.any(String) }]);
    expect(alerts).toHaveLength(1);
  });

  it("raises a fault alert for a 200 that is not a scrape response", async () => {
    respond = async () => [200, { hello: "world" }];

    const { errors } = await adapter().poll(window);

    expect(errors).toEqual([{ kind: "fault", message: expect.any(String) }]);
    expect(alerts).toHaveLength(1);
  });
});

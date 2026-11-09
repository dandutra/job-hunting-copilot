import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { openTestDb, resetTestDb, testDatabaseUrl } from "../../test/test-db";
import { CompaniesService } from "../companies/companies.service";
import { MatchingHooks } from "../matching/matching-hooks";
import { SightingMatcher } from "../matching/sighting-matcher";
import { PrismaService } from "../prisma/prisma.service";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { IngestScheduler } from "./ingest-scheduler";
import { AdapterResult, JobSourceAdapter } from "./job-source-adapter";

class FakeAdapter extends JobSourceAdapter {
  readonly minIntervalMs = 0;
  constructor(
    readonly name: string,
    private readonly fails: boolean,
  ) {
    super();
  }
  async poll(): Promise<AdapterResult> {
    if (this.fails) throw new Error("source down");
    return { drafts: [], errors: [], completeBoards: [] };
  }
}

describe("HeartbeatPollHooks through the scheduler", () => {
  let prisma: PrismaService;
  let server: Server;
  let url: string;
  let pings: number;
  let status: number;

  const run = (adapters: JobSourceAdapter[], heartbeatUrl = url) => {
    const matcher = new SightingMatcher(prisma, new CompaniesService(prisma), {
      descriptionUpgraded: async () => {},
    } as MatchingHooks);
    return new IngestScheduler(
      adapters,
      matcher,
      prisma,
      { alert: async () => {} },
      new HeartbeatPollHooks(heartbeatUrl),
      { lockUrl: testDatabaseUrl() },
    ).tick(new Date());
  };

  beforeAll(async () => {
    prisma = await openTestDb();
    server = createServer((_req, res) => {
      pings += 1;
      res.statusCode = status;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ping`;
  });
  beforeEach(async () => {
    await resetTestDb(prisma);
    pings = 0;
    status = 200;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });

  it("pings once when one adapter succeeds and another fails", async () => {
    await run([new FakeAdapter("a", true), new FakeAdapter("b", false)]);
    expect(pings).toBe(1);
  });

  it("sends no ping when every adapter fails", async () => {
    await run([new FakeAdapter("a", true), new FakeAdapter("b", true)]);
    expect(pings).toBe(0);
  });

  it("finishes the poll when the ping endpoint answers 500", async () => {
    status = 500;
    const outcomes = await run([new FakeAdapter("a", false)]);
    expect(pings).toBe(1);
    expect(outcomes).not.toBe("skipped");
  });

  it("finishes the poll when the ping endpoint is unreachable", async () => {
    const outcomes = await run(
      [new FakeAdapter("a", false)],
      "http://127.0.0.1:1/ping",
    );
    expect(outcomes).not.toBe("skipped");
  });

  it("sends nothing when HEARTBEAT_URL is empty", async () => {
    await run([new FakeAdapter("a", false)], "");
    expect(pings).toBe(0);
  });
});

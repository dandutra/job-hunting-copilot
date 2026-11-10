import { createServer, IncomingMessage, Server } from "node:http";
import { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { openTestDb, resetTestDb } from "../../test/test-db";
import { TypeSafeJevClient } from "./jev-client";
import { JevRunner } from "./jev-runner";
import { CAP_NAMES, QUESTION_SET_VERSION } from "./question-set";

const SENTINEL = "zq-profile-sentinel-3317";
const DAY = 24 * 60 * 60 * 1000;

function profileYaml(extra = ""): string {
  return `sources: [user]
contact:
  name: Sam Sample
  city: Exampleton
  email: sam@example.com
experiences:
  - id: E1
    employer: Northwind Example Inc.
    titles: [Developer]
    start: 2022-01
    location: Exampleton
    type: employment
facts:
  - id: F1
    parent: E1
    text: Built a nightly report ${SENTINEL}.
    tags: [back-end]
    ownership: solo
    sources: [user]
    use: [resume]
skills:
  - id: S1
    name: TypeScript
    evidence: [F1]
${extra}`;
}

function validAnswers() {
  const answers: Record<string, unknown> = {
    skills_covered: { type: "score", score: 2.4 },
    level_match: { type: "score", score: 1.1 },
    role_family: { type: "choice", choice: "back_end", confidence: 0.8 },
    work_arrangement: { type: "choice", choice: "hybrid", confidence: 0.6 },
  };
  for (const name of CAP_NAMES) answers[name] = { type: "noul", noul: 0.05 };
  return answers;
}

type Reply = { status: number; body: unknown };
type SentBody = {
  model: string;
  state: {
    posting: { title: string; location: string; description: string };
    master_profile: string;
  };
  questions: Record<string, unknown>;
};

describe("JevRunner", () => {
  let prisma: PrismaService;
  let server: Server;
  let baseURL: string;
  let requests: { auth?: string; body: SentBody }[];
  let replies: ((req: number) => Reply)[];
  let runner: JevRunner;
  let companyId: number;
  let seq = 0;

  const ok = (): Reply => ({
    status: 200,
    body: {
      model: "jev-1.14.0",
      answers: validAnswers(),
      usage: { input_tokens: 321, output_tokens: 9 },
    },
  });

  beforeAll(async () => {
    prisma = await openTestDb();
    server = createServer((req: IncomingMessage, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        requests.push({
          auth: req.headers.authorization,
          body: JSON.parse(raw),
        });
        const reply = (replies.shift() ?? ok)(requests.length);
        res.writeHead(reply.status, { "content-type": "application/json" });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await resetTestDb(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDb(prisma);
    requests = [];
    replies = [];
    const client = new TypeSafeJevClient({
      apiKey: "test-key",
      model: "jev-1.14.0",
      baseURL,
      backoffInitialMs: 1,
    });
    runner = new JevRunner(prisma, client);
    companyId = (await prisma.company.create({ data: { name: "Acme" } })).id;
  });

  async function addProfile(extra = "", createdAt = new Date()) {
    const raw = profileYaml(extra);
    const id = createHash("sha256").update(raw).digest("hex");
    await prisma.masterProfileVersion.create({
      data: { id, rawYaml: raw, createdAt },
    });
    return id;
  }

  async function addPosting(
    descriptionKind = "full",
    sighting: { lastSeenAt?: Date; closedAt?: Date; watched?: boolean } = {},
  ) {
    seq++;
    const posting = await prisma.posting.create({
      data: {
        companyId,
        title: `Developer ${seq}`,
        location: "Toronto, ON",
        description: descriptionKind === "none" ? "" : `Build things ${seq}`,
        descriptionKind,
        postedAt: new Date(),
      },
    });
    await prisma.sighting.create({
      data: {
        postingId: posting.id,
        jobSource: "test",
        listingKey: `test:${seq}`,
        url: "https://example.com",
        reportedAt: new Date(),
        companyId,
        companyName: "Acme",
        title: posting.title,
        location: posting.location,
        description: posting.description,
        descriptionKind,
        watchedCompanyId: sighting.watched ? companyId : null,
        firstSeenAt: new Date(),
        lastSeenAt: sighting.lastSeenAt ?? new Date(),
        closedAt: sighting.closedAt ?? null,
      },
    });
    return posting;
  }

  const judgementsOf = (postingId: number) =>
    prisma.jevJudgement.findMany({ where: { postingId } });

  it("sends one request per Posting and stores the raw answers with model and versions", async () => {
    const profileId = await addProfile();
    const posting = await addPosting();

    await runner.run();

    expect(requests).toHaveLength(1);
    const { auth, body } = requests[0];
    expect(auth).toBe("Bearer test-key");
    expect(body.model).toBe("jev-1.14.0");
    expect(Object.keys(body.questions)).toEqual([
      "skills_covered",
      "level_match",
      "role_family",
      "work_arrangement",
      ...CAP_NAMES,
    ]);
    expect(body.state.posting).toEqual({
      title: posting.title,
      location: "Toronto, ON",
      description: posting.description,
    });
    expect(body.state.master_profile).toContain("TypeScript");
    expect(body.state.master_profile).toContain(SENTINEL);
    expect(body.state.master_profile).not.toContain("sam@example.com");

    const [row] = await judgementsOf(posting.id);
    expect(row).toMatchObject({
      profileVersionId: profileId,
      questionSetVersion: QUESTION_SET_VERSION,
      descriptionKind: "full",
      model: "jev-1.14.0",
      inputTokens: 321,
      outputTokens: 9,
      answers: validAnswers(),
    });
  });

  it("judges nothing twice when nothing changed", async () => {
    await addProfile();
    const posting = await addPosting();
    await runner.run();
    await runner.run();
    expect(requests).toHaveLength(1);
    expect(await judgementsOf(posting.id)).toHaveLength(1);
  });

  it("reruns when a description moves from snippet to full, not from full to full", async () => {
    await addProfile();
    const snippet = await addPosting("snippet");
    const full = await addPosting("full");
    await runner.run();
    expect(requests).toHaveLength(2);

    await prisma.posting.update({
      where: { id: snippet.id },
      data: { descriptionKind: "full", description: "Now the whole text" },
    });
    await prisma.posting.update({
      where: { id: full.id },
      data: { description: "A longer full description" },
    });
    await runner.run();

    expect(requests).toHaveLength(3);
    expect(requests[2].body.state.posting.description).toBe(
      "Now the whole text",
    );
    expect(await judgementsOf(snippet.id)).toHaveLength(2);
    expect(await judgementsOf(full.id)).toHaveLength(1);
  });

  it("rejudges Postings that are not Closed or Stale when a new profile version arrives", async () => {
    await addProfile();
    const open = await addPosting("full");
    const closed = await addPosting("full", {
      watched: true,
      lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const stale = await addPosting("full", {
      lastSeenAt: new Date(Date.now() - 40 * DAY),
    });
    await runner.run();
    expect(requests).toHaveLength(3);

    const second = await addProfile(
      "  - id: S2\n    name: Go\n    evidence: [F1]\n",
      new Date(Date.now() + 1000),
    );
    await runner.run();

    expect(requests).toHaveLength(4);
    const rows = await judgementsOf(open.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.profileVersionId)).toContain(second);
    expect(await judgementsOf(closed.id)).toHaveLength(1);
    expect(await judgementsOf(stale.id)).toHaveLength(1);
  });

  it.each([
    ["a 500", { status: 500, body: { detail: "boom" } }],
    ["a malformed body", { status: 200, body: { nope: true } }],
    [
      "an out-of-range answer",
      {
        status: 200,
        body: {
          model: "jev-1.14.0",
          answers: { ...validAnswers(), skills_covered: { score: 9 } },
          usage: {},
        },
      },
    ],
  ])(
    "stores nothing after %s and retries on the next run",
    async (_n, reply) => {
      await addProfile();
      const posting = await addPosting();
      replies = [() => reply];

      const first = await runner.run();
      expect(first).toMatchObject({ judged: 0, failed: 1 });
      expect(await judgementsOf(posting.id)).toHaveLength(0);

      await runner.run();
      expect(await judgementsOf(posting.id)).toHaveLength(1);
    },
  );

  it("retries a 429 and then stores the judgement", async () => {
    await addProfile();
    const posting = await addPosting();
    replies = [() => ({ status: 429, body: { detail: "slow down" } })];

    await runner.run();

    expect(requests).toHaveLength(2);
    expect(await judgementsOf(posting.id)).toHaveLength(1);
  });

  it("stores nothing when 429 never clears", async () => {
    await addProfile();
    const posting = await addPosting();
    replies = Array.from({ length: 4 }, () => () => ({
      status: 429,
      body: { detail: "slow down" },
    }));

    const counts = await runner.run();

    expect(counts.failed).toBe(1);
    expect(await judgementsOf(posting.id)).toHaveLength(0);
  });

  it("does not stop the batch when one Posting fails", async () => {
    await addProfile();
    const a = await addPosting();
    const b = await addPosting();
    replies = [() => ({ status: 500, body: { detail: "boom" } })];

    const counts = await runner.run();

    expect(counts).toMatchObject({ found: 2, judged: 1, failed: 1 });
    expect(await judgementsOf(a.id)).toHaveLength(0);
    expect(await judgementsOf(b.id)).toHaveLength(1);
  });

  it("stops between Postings on shutdown and leaves the rest for the next poll", async () => {
    await addProfile();
    await addPosting();
    await addPosting();
    let calls = 0;

    const counts = await runner.run({ shouldStop: () => calls++ > 0 });

    expect(counts).toMatchObject({ found: 2, judged: 1, failed: 0 });
    expect(await runner.run()).toMatchObject({ found: 1, judged: 1 });
  });

  it("stops when the run's time budget is spent", async () => {
    await addProfile();
    await addPosting();

    const counts = await runner.run({ budgetMs: 0 });

    expect(counts).toMatchObject({ found: 1, judged: 0 });
    expect(requests).toHaveLength(0);
  });

  it("judges nothing without a profile version", async () => {
    await addPosting();
    const counts = await runner.run();
    expect(counts.found).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it("never logs Master profile content", async () => {
    const lines: string[] = [];
    const spies = (["log", "warn", "error", "debug", "verbose"] as const).map(
      (level) =>
        jest
          .spyOn(Logger.prototype, level)
          .mockImplementation(
            (...args: unknown[]) => void lines.push(String(args[0])),
          ),
    );
    try {
      await addProfile();
      await addPosting();
      replies = [() => ({ status: 500, body: { detail: SENTINEL } })];
      await runner.run();
      await runner.run();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(SENTINEL);
    expect(lines.join("\n")).not.toContain("TypeScript");
  });
});

describe("TypeSafeJevClient", () => {
  it("refuses an alias that moves", () => {
    expect(
      () => new TypeSafeJevClient({ apiKey: "k", model: "jev-latest" }),
    ).toThrow(/pinned/);
  });
});

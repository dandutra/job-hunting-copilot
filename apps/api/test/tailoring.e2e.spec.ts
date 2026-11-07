import { INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { MasterProfileModule } from "../src/master-profile/master-profile.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { TailoringModule } from "../src/tailoring/tailoring.module";
import { openTestDb, resetTestDb } from "./test-db";

const LOGIN = "tester@example.com";
const SENTINEL = "zq-sentinel-5512";
const POSTING_SENTINEL = "zq-posting-9904";

// Synthetic profile. F2 is retired in the second version; E2 is fixed.
function profileYaml(o: { retireF2?: boolean } = {}): string {
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
  - id: E2
    employer: Volunteer Example Club
    titles: [Helper]
    start: 2020-01
    end: 2021-12
    location: Exampleton
    type: volunteer
    fixed: true
projects:
  - id: P1
    name: Widget Tool
education:
  - id: D1
    school: Example University
    program: BSc
    start: 2016-09
facts:
  - id: F1
    parent: E1
    text: Built a nightly report ${SENTINEL}.
    tags: [back-end]
    ownership: solo
    sources: [user]
  - id: F2
    parent: E1
    text: Shipped weekly with a team of five.
    tags: [general]
    ownership: team
    sources: [user]
    retired: ${o.retireF2 ? "true" : "false"}
  - id: F3
    parent: P1
    text: Wrote a small command line tool.
    tags: [general]
    ownership: solo
    sources: [user]
    use: [resume]
skills:
  - id: S1
    name: TypeScript
    aliases: [TS]
    evidence: [F1]
do_not_claims:
  - id: X1
    text: Never claim to have led the team.
`;
}

const line = (text: string, cites: string[]) => ({ text, cites });

function goodDraft(profileVersion: string, over: Record<string, unknown> = {}) {
  return {
    profileVersion,
    summary: line("A developer who builds reports.", ["F1"]),
    experiences: [
      { id: "E1", bullets: [line("Built a nightly report.", ["F1"])] },
      { id: "E2", bullets: [] },
    ],
    projects: [
      { id: "P1", bullets: [line("Wrote a command line tool.", ["F3"])] },
    ],
    educationIds: ["D1"],
    skills: [{ skillId: "S1", text: "TS" }],
    coverLetter: [line("I build reports.", ["F1"])],
    ...over,
  };
}

describe("tailoring", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let postingId: number;

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, MasterProfileModule, TailoringModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await resetTestDb(prisma);
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDb(prisma);
    const company = await prisma.company.create({
      data: { name: "Acme Example", ats: "greenhouse", boardSlug: "acme" },
    });
    const posting = await prisma.posting.create({
      data: {
        companyId: company.id,
        title: "Developer",
        location: "Toronto",
        description: `We want a developer. ${POSTING_SENTINEL}`,
        descriptionKind: "full",
        postedAt: new Date(),
      },
    });
    postingId = posting.id;
  });

  const authed = (r: request.Test) => r.set("Tailscale-User-Login", LOGIN);
  const importProfile = async (yaml: string) => {
    const res = await authed(
      request(app.getHttpServer()).put("/master-profile"),
    ).send({ yaml });
    expect(res.status).toBe(200);
    return res.body.version as string;
  };
  const submit = (draft: unknown, id = postingId) =>
    authed(
      request(app.getHttpServer()).post(`/postings/${id}/tailored-resumes`),
    ).send(draft as object);
  const act = (id: number, action: string, body: object = {}) =>
    authed(
      request(app.getHttpServer()).post(`/tailored-resumes/${id}/${action}`),
    ).send(body);
  const statuses = async () =>
    (await prisma.tailoredResume.findMany({ orderBy: { id: "asc" } })).map(
      (r) => r.status,
    );

  it("stores a passing draft and supersedes the earlier unapproved one", async () => {
    const v1 = await importProfile(profileYaml());
    const first = await submit(goodDraft(v1));
    const second = await submit(goodDraft(v1));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ id: expect.any(Number), status: "draft" });
    expect(await statuses()).toEqual(["superseded", "draft"]);
  });

  it("answers 422 with rule 6 when the draft names an older profile version", async () => {
    const v1 = await importProfile(profileYaml());
    await importProfile(profileYaml({ retireF2: true }));
    const res = await submit(goodDraft(v1));

    expect(res.status).toBe(422);
    expect(res.body.failures).toContainEqual(
      expect.objectContaining({ rule: 6, location: "profileVersion" }),
    );
    expect(await prisma.tailoredResume.count()).toBe(0);
  });

  it("lists every failing line and stores nothing", async () => {
    const v1 = await importProfile(profileYaml());
    const res = await submit(
      goodDraft(v1, {
        summary: line("Uncited.", []),
        projects: [{ id: "P1", bullets: [line("Wrong owner.", ["F2"])] }],
        skills: [{ skillId: "S1", text: "Typescript" }],
        experiences: [{ id: "E1", bullets: [line("Fine.", ["F1"])] }],
      }),
    );

    expect(res.status).toBe(422);
    const found = res.body.failures.map(
      (f: { rule: number; location: string }) => `${f.rule}@${f.location}`,
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "1@summary",
        "3@projects[0].bullets[0]",
        "4@skills[0]",
        "5@experiences",
      ]),
    );
    expect(await prisma.tailoredResume.count()).toBe(0);
  });

  it("checks a draft built from the user's edits and fails an uncited line", async () => {
    const v1 = await importProfile(profileYaml());
    const original = await submit(goodDraft(v1));
    const edited = goodDraft(v1, {
      experiences: [
        { id: "E1", bullets: [line("Built it in Rust.", [])] },
        { id: "E2", bullets: [] },
      ],
    });
    const res = await submit(edited);

    expect(res.status).toBe(422);
    expect(res.body.failures).toEqual([
      expect.objectContaining({
        rule: 1,
        location: "experiences[0].bullets[0]",
      }),
    ]);
    expect(await statuses()).toEqual(["draft"]);
    expect(original.status).toBe(201);
  });

  it("answers 422 for a body that is not a draft and 404 for an unknown Posting", async () => {
    const v1 = await importProfile(profileYaml());
    expect((await submit({ profileVersion: v1, extra: 1 })).status).toBe(422);
    expect((await submit(goodDraft(v1), postingId + 999)).status).toBe(404);
    expect(await prisma.tailoredResume.count()).toBe(0);
  });

  it("fails approve after a cited Fact is retired and leaves the draft open", async () => {
    const v1 = await importProfile(profileYaml());
    const { body } = await submit(
      goodDraft(v1, {
        experiences: [
          { id: "E1", bullets: [line("Shipped weekly.", ["F2"])] },
          { id: "E2", bullets: [] },
        ],
      }),
    );
    await importProfile(profileYaml({ retireF2: true }));
    const res = await act(body.id, "approve");

    expect(res.status).toBe(422);
    expect(res.body.failures).toContainEqual(
      expect.objectContaining({
        rule: 1,
        location: "experiences[0].bullets[0]",
      }),
    );
    expect(await statuses()).toEqual(["draft"]);
  });

  it("supersedes the first approved draft when a second is approved", async () => {
    const v1 = await importProfile(profileYaml());
    const a = await submit(goodDraft(v1));
    expect((await act(a.body.id, "approve")).body.status).toBe("approved");
    const b = await submit(goodDraft(v1));
    const res = await act(b.body.id, "approve");

    expect(res.status).toBe(200);
    expect(await statuses()).toEqual(["superseded", "approved"]);
    expect(
      await prisma.tailoredResume.count({ where: { status: "approved" } }),
    ).toBe(1);
  });

  it("answers 409 when approving a draft that is no longer open", async () => {
    const v1 = await importProfile(profileYaml());
    const a = await submit(goodDraft(v1));
    await submit(goodDraft(v1));

    expect((await act(a.body.id, "approve")).status).toBe(409);
    expect((await act(999999, "approve")).status).toBe(404);
  });

  it("stores the Claim review's verdicts and refuses a bad one", async () => {
    const v1 = await importProfile(profileYaml());
    const { body } = await submit(goodDraft(v1));
    const bad = await act(body.id, "review", {
      verdicts: [
        { line: "summary", status: "do-not-claim", doNotClaimId: "X9" },
        { line: "nowhere", status: "pass" },
        { line: "coverLetter[0]", status: "overstatement" },
      ],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveLength(3);

    const ok = await act(body.id, "review", {
      verdicts: [
        { line: "summary", status: "pass" },
        {
          line: "coverLetter[0]",
          status: "overstatement",
          note: "Too strong.",
        },
        {
          line: "projects[0].bullets[0]",
          status: "do-not-claim",
          doNotClaimId: "X1",
        },
      ],
    });
    expect(ok.status).toBe(200);
    const got = await authed(
      request(app.getHttpServer()).get(`/tailored-resumes/${body.id}`),
    );
    expect(got.body.verdicts).toEqual([
      { line: "summary", status: "pass" },
      { line: "coverLetter[0]", status: "overstatement", note: "Too strong." },
      {
        line: "projects[0].bullets[0]",
        status: "do-not-claim",
        doNotClaimId: "X1",
      },
    ]);
  });

  it("rejects a draft with a note and shows the note in the next tailoring input", async () => {
    const v1 = await importProfile(profileYaml());
    const { body } = await submit(goodDraft(v1));
    const res = await act(body.id, "reject", {
      note: "Too generic.",
      lines: [
        { line: "summary", doNotClaimId: "X1" },
        { line: "coverLetter[0]" },
      ],
    });
    expect(res.body).toEqual({ id: body.id, status: "rejected" });
    expect((await act(body.id, "reject", { note: "again" })).status).toBe(409);

    const input = await authed(
      request(app.getHttpServer()).get(
        `/postings/${postingId}/tailoring-input`,
      ),
    );
    expect(input.body.rejectNotes).toEqual([
      {
        resumeId: body.id,
        note: "Too generic.",
        lines: [
          { line: "summary", doNotClaimId: "X1" },
          { line: "coverLetter[0]" },
        ],
      },
    ]);
  });

  it("refuses a reject without a note or with an unknown line", async () => {
    const v1 = await importProfile(profileYaml());
    const { body } = await submit(goodDraft(v1));

    expect((await act(body.id, "reject", { note: " " })).status).toBe(400);
    expect(
      (
        await act(body.id, "reject", {
          note: "x",
          lines: [{ line: "nowhere" }],
        })
      ).status,
    ).toBe(400);
    expect(await statuses()).toEqual(["draft"]);
  });

  it("returns the tailoring input: unretired Entries, the ATS and the Thin flag", async () => {
    await importProfile(profileYaml());
    const v2 = await importProfile(profileYaml({ retireF2: true }));
    const res = await authed(
      request(app.getHttpServer()).get(
        `/postings/${postingId}/tailoring-input`,
      ),
    );

    expect(res.status).toBe(200);
    expect(res.body.profileVersion).toBe(v2);
    expect(res.body.posting).toMatchObject({
      id: postingId,
      company: "Acme Example",
      ats: "greenhouse",
      thin: false,
      text: expect.stringContaining(POSTING_SENTINEL),
    });
    expect(res.body.facts.map((f: { id: string }) => f.id)).toEqual([
      "F1",
      "F3",
    ]);
    expect(res.body.experiences.map((e: { id: string }) => e.id)).toEqual([
      "E1",
      "E2",
    ]);
    expect(res.body.doNotClaims).toEqual([
      { id: "X1", text: "Never claim to have led the team." },
    ]);
    expect(res.body.rejectNotes).toEqual([]);
    expect(res.body).not.toHaveProperty("contact");

    await prisma.posting.update({
      where: { id: postingId },
      data: { descriptionKind: "snippet" },
    });
    const thin = await authed(
      request(app.getHttpServer()).get(
        `/postings/${postingId}/tailoring-input`,
      ),
    );
    expect(thin.body.posting.thin).toBe(true);
  });

  it("answers 409 for the input before any profile is stored, and 404 for an unknown Posting", async () => {
    const none = await authed(
      request(app.getHttpServer()).get(
        `/postings/${postingId}/tailoring-input`,
      ),
    );
    expect(none.status).toBe(409);
    await importProfile(profileYaml());
    const missing = await authed(
      request(app.getHttpServer()).get(
        `/postings/${postingId + 999}/tailoring-input`,
      ),
    );
    expect(missing.status).toBe(404);
  });

  it("returns the draft with filled fields and cited Fact text, never the Posting text", async () => {
    const v1 = await importProfile(profileYaml());
    const { body } = await submit(
      goodDraft(v1, { postingText: `Pasted ${POSTING_SENTINEL}` }),
    );
    const res = await authed(
      request(app.getHttpServer()).get(`/tailored-resumes/${body.id}`),
    );

    expect(res.status).toBe(200);
    expect(res.body.experiences[0]).toMatchObject({
      employer: "Northwind Example Inc.",
      titles: ["Developer"],
      fixed: false,
      bullets: [
        {
          line: "experiences[0].bullets[0]",
          text: "Built a nightly report.",
          cites: [{ id: "F1", text: `Built a nightly report ${SENTINEL}.` }],
        },
      ],
    });
    expect(res.body.experiences[1]).toMatchObject({
      employer: "Volunteer Example Club",
      fixed: true,
      bullets: [],
    });
    expect(res.body.education[0]).toMatchObject({
      school: "Example University",
    });
    expect(res.body.contact).toMatchObject({ name: "Sam Sample" });
    expect(res.body.coverLetter).toMatchObject({
      greeting: "Dear Acme Example hiring team,",
      signOff: "Sincerely,\nSam Sample",
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(POSTING_SENTINEL);
    expect(text).not.toContain("Pasted");
    const row = await prisma.tailoredResume.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(row.postingText).toBe(`Pasted ${POSTING_SENTINEL}`);
    expect(JSON.stringify(row.draft)).not.toContain("Pasted");
  });

  it("answers 401 without the Tailscale login", async () => {
    const res = await request(app.getHttpServer()).get(
      `/postings/${postingId}/tailoring-input`,
    );
    expect(res.status).toBe(401);
  });

  it("never logs draft or profile text", async () => {
    const lines: string[] = [];
    const spies = (["log", "warn", "error", "debug", "verbose"] as const).map(
      (level) =>
        jest
          .spyOn(Logger.prototype, level)
          .mockImplementation(
            (...args: unknown[]) => void lines.push(args.join(" ")),
          ),
    );
    const v1 = await importProfile(profileYaml());
    const ok = await submit(goodDraft(v1, { postingText: POSTING_SENTINEL }));
    await submit(
      goodDraft(v1, { summary: line(`${SENTINEL} uncited`, [SENTINEL]) }),
    );
    await act(ok.body.id, "approve");
    await act(ok.body.id, "reject", { note: SENTINEL });
    spies.forEach((s) => s.mockRestore());

    const logged = lines.join("\n");
    expect(logged).not.toContain(SENTINEL);
    expect(logged).not.toContain(POSTING_SENTINEL);
    expect(logged).not.toContain("Northwind");
  });
});

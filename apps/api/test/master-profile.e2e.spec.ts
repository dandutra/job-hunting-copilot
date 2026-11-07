import { createHash } from "node:crypto";
import { INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { MasterProfileModule } from "../src/master-profile/master-profile.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { openTestDb } from "./test-db";

const LOGIN = "tester@example.com";
const SENTINEL = "zq-sentinel-7731";

interface Options {
  withSecondFact?: boolean;
  retireSecondFact?: boolean;
  badTag?: boolean;
  empty?: boolean;
}

// Synthetic profile; SENTINEL marks text that must never reach a log.
function profileYaml(o: Options = {}): string {
  const contact = `sources: [user]
contact:
  name: Sam Sample
  city: Exampleton
  email: sam@example.com
`;
  if (o.empty) return contact;
  return `${contact}experiences:
  - id: E1
    employer: Northwind Example Inc. ${SENTINEL}
    titles: [Developer]
    start: 2022-01
    location: Exampleton
    type: employment
facts:
  - id: F1
    parent: E1
    text: Built a nightly report.
    tags: [${o.badTag ? "not-a-tag" : "back-end"}]
    ownership: solo
    sources: [user]
${
  o.withSecondFact
    ? `  - id: F2
    parent: E1
    text: Shipped weekly with a team of five.
    tags: [general]
    ownership: team
    sources: [user]
    retired: ${o.retireSecondFact ? "true" : "false"}
`
    : ""
}`;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("PUT /master-profile", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await openTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, MasterProfileModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.masterProfileVersion.deleteMany();
  });

  const put = (yaml: unknown) =>
    request(app.getHttpServer())
      .put("/master-profile")
      .set("Tailscale-User-Login", LOGIN)
      .send({ yaml });

  it("stores a valid file as a version named by its hash", async () => {
    const yaml = profileYaml();
    const res = await put(yaml);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: sha(yaml),
      created: true,
      read: 2,
      added: 2,
      retired: 0,
    });
    const rows = await prisma.masterProfileVersion.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sha(yaml));
    expect(rows[0].rawYaml).toBe(yaml);
  });

  it("stores nothing when the same file is sent again", async () => {
    const yaml = profileYaml();
    await put(yaml);
    const res = await put(yaml);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: sha(yaml),
      created: false,
      read: 2,
      added: 0,
      retired: 0,
    });
    expect(await prisma.masterProfileVersion.count()).toBe(1);
  });

  it("stores a changed file as a second version and counts the added Entry", async () => {
    await put(profileYaml());
    const res = await put(profileYaml({ withSecondFact: true }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: true, read: 3, added: 1 });
    expect(await prisma.masterProfileVersion.count()).toBe(2);
  });

  it("returns every error for an invalid file and stores nothing", async () => {
    const res = await put(profileYaml({ badTag: true }) + "bogus: 1\n");

    expect(res.status).toBe(400);
    const ids = res.body.errors.map((e: { id: string }) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids).toContain("F1");
    expect(await prisma.masterProfileVersion.count()).toBe(0);
  });

  it("rejects a file with no Entries", async () => {
    const res = await put(profileYaml({ empty: true }));

    expect(res.status).toBe(400);
    expect(await prisma.masterProfileVersion.count()).toBe(0);
  });

  it.each([[undefined], [42], [""]])(
    "rejects a body whose yaml is %p",
    async (yaml) => {
      const res = await put(yaml);
      expect(res.status).toBe(400);
      expect(await prisma.masterProfileVersion.count()).toBe(0);
    },
  );

  it("rejects a file where a known ID has disappeared, naming that ID", async () => {
    await put(profileYaml({ withSecondFact: true }));
    const res = await put(profileYaml());

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ id: "F2", message: expect.any(String) }),
    ]);
    expect(await prisma.masterProfileVersion.count()).toBe(1);
  });

  it("accepts retiring an Entry and counts it", async () => {
    await put(profileYaml({ withSecondFact: true }));
    const res = await put(
      profileYaml({ withSecondFact: true, retireSecondFact: true }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: true, added: 0, retired: 1 });
    expect(await prisma.masterProfileVersion.count()).toBe(2);
  });

  it("answers 401 without the Tailscale login", async () => {
    const res = await request(app.getHttpServer())
      .put("/master-profile")
      .send({ yaml: profileYaml() });

    expect(res.status).toBe(401);
    expect(await prisma.masterProfileVersion.count()).toBe(0);
  });

  it("never logs the profile's content", async () => {
    const lines: string[] = [];
    const spies = (["log", "warn", "error", "debug", "verbose"] as const).map(
      (level) =>
        jest
          .spyOn(Logger.prototype, level)
          .mockImplementation(
            (...args: unknown[]) => void lines.push(args.join(" ")),
          ),
    );
    await put(profileYaml());
    await put(profileYaml({ badTag: true }));
    await put(profileYaml({ withSecondFact: true }));
    await put(profileYaml());
    spies.forEach((s) => s.mockRestore());

    expect(lines.join("\n")).not.toContain(SENTINEL);
    expect(lines.join("\n")).not.toContain("Northwind");
  });
});

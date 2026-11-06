import { Controller, Get, Post, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { HealthController } from "../src/health.controller";

@Controller("things")
class ThingsController {
  @Get() list() {
    return [];
  }
  @Post() create() {
    return { ok: true };
  }
}

const LOGIN = "me@example.com";

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule],
    controllers: [HealthController, ThingsController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("Tailnet identity guard", () => {
  let app: INestApplication;
  const original = process.env.ALLOWED_TAILSCALE_LOGIN;

  beforeAll(async () => {
    process.env.ALLOWED_TAILSCALE_LOGIN = LOGIN;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    process.env.ALLOWED_TAILSCALE_LOGIN = original;
  });

  it("lets the right login through", async () => {
    const res = await request(app.getHttpServer())
      .get("/things")
      .set("Tailscale-User-Login", LOGIN);
    expect(res.status).toBe(200);
  });

  it.each([
    ["a wrong login", { "Tailscale-User-Login": "eve@example.com" }],
    ["a missing header", {}],
    ["an empty header", { "Tailscale-User-Login": "" }],
  ])("rejects %s with 401", async (_name, headers) => {
    const res = await request(app.getHttpServer()).get("/things").set(headers);
    expect(res.status).toBe(401);
  });

  it("serves /health without a header", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
  });

  it("rejects a cross-site POST with 403", async () => {
    const res = await request(app.getHttpServer())
      .post("/things")
      .set("Tailscale-User-Login", LOGIN)
      .set("Host", "copilot.tail1234.ts.net")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("lets a POST from the app's own origin through", async () => {
    const res = await request(app.getHttpServer())
      .post("/things")
      .set("Tailscale-User-Login", LOGIN)
      .set("Host", "copilot.tail1234.ts.net")
      .set("Origin", "https://copilot.tail1234.ts.net");
    expect(res.status).toBe(201);
  });

  it("lets a POST with no Origin through, as a CLI sends", async () => {
    const res = await request(app.getHttpServer())
      .post("/things")
      .set("Tailscale-User-Login", LOGIN);
    expect(res.status).toBe(201);
  });

  it("checks the login before the origin", async () => {
    const res = await request(app.getHttpServer())
      .post("/things")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(401);
  });

  it("logs the rejected login but not the body", async () => {
    const logs: string[] = [];
    const spy = jest
      .spyOn(console, "warn")
      .mockImplementation((m: string) => void logs.push(String(m)));
    const { Logger } = await import("@nestjs/common");
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation((m: unknown) => void logs.push(String(m)));
    await request(app.getHttpServer())
      .post("/things")
      .set("Tailscale-User-Login", "eve@example.com")
      .send({ secret: "hunter2" });
    spy.mockRestore();
    warn.mockRestore();
    expect(logs.join("\n")).toContain("eve@example.com");
    expect(logs.join("\n")).not.toContain("hunter2");
  });
});

describe("boot", () => {
  it.each(["", "   ", undefined])(
    "refuses to start with ALLOWED_TAILSCALE_LOGIN=%j",
    async (value) => {
      const original = process.env.ALLOWED_TAILSCALE_LOGIN;
      if (value === undefined) delete process.env.ALLOWED_TAILSCALE_LOGIN;
      else process.env.ALLOWED_TAILSCALE_LOGIN = value;
      try {
        await expect(buildApp()).rejects.toThrow(/ALLOWED_TAILSCALE_LOGIN/);
      } finally {
        process.env.ALLOWED_TAILSCALE_LOGIN = original;
      }
    },
  );
});

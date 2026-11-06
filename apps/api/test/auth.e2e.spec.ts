import {
  Controller,
  Get,
  INestApplication,
  Logger,
  Post,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
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

function restoreLogin(original: string | undefined): void {
  if (original === undefined) delete process.env.ALLOWED_TAILSCALE_LOGIN;
  else process.env.ALLOWED_TAILSCALE_LOGIN = original;
}

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
    restoreLogin(original);
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
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation((m: unknown) => void logs.push(String(m)));
    await request(app.getHttpServer())
      .post("/things")
      .set("Tailscale-User-Login", "eve@example.com")
      .send({ secret: "hunter2" });
    warn.mockRestore();
    expect(logs.join("\n")).toContain("eve@example.com");
    expect(logs.join("\n")).not.toContain("hunter2");
  });
});

describe("AppModule", () => {
  it("guards its routes", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThingsController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const res = await request(app.getHttpServer()).get("/things");
      expect(res.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("answers GET /me with the allowed login", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const login = process.env.ALLOWED_TAILSCALE_LOGIN!;
      const ok = await request(app.getHttpServer())
        .get("/me")
        .set("Tailscale-User-Login", login);
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ login });

      const forged = await request(app.getHttpServer())
        .get("/me")
        .set("Tailscale-User-Login", "eve@example.com");
      expect(forged.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("refuses to compile with an empty login", async () => {
    const original = process.env.ALLOWED_TAILSCALE_LOGIN;
    process.env.ALLOWED_TAILSCALE_LOGIN = "";
    try {
      await expect(
        Test.createTestingModule({ imports: [AppModule] }).compile(),
      ).rejects.toThrow(/ALLOWED_TAILSCALE_LOGIN/);
    } finally {
      restoreLogin(original);
    }
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
        restoreLogin(original);
      }
    },
  );
});

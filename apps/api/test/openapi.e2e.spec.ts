import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { serveOpenApi } from "../src/openapi";

describe("GET /docs-json", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    serveOpenApi(app);
    await app.init();
  });

  afterAll(() => app.close());

  it("serves the spec with the health route", async () => {
    const res = await request(app.getHttpServer()).get("/docs-json");

    expect(res.status).toBe(200);
    expect(res.body.paths["/health"]).toBeDefined();
  });
});

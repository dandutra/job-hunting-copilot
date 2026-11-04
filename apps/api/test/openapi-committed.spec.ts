import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/openapi";

it("committed openapi.json matches the DTOs; run pnpm generate if not", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  const committed = JSON.parse(
    readFileSync(resolve(__dirname, "../openapi.json"), "utf8"),
  );

  const built = buildOpenApiDocument(app);
  await app.close();

  expect(built).toEqual(committed);
});

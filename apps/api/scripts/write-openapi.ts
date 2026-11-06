import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/openapi";

async function main() {
  // The spec doesn't depend on the login, and CI has none to give.
  process.env.ALLOWED_TAILSCALE_LOGIN ||= "spec-generator@example.com";
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  await app.close();
  writeFileSync(
    resolve(__dirname, "../openapi.json"),
    JSON.stringify(document, null, 2) + "\n",
  );
}
void main();

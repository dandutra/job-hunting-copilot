import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/openapi";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  await app.close();
  writeFileSync(
    resolve(__dirname, "../openapi.json"),
    JSON.stringify(document, null, 2) + "\n",
  );
}
void main();

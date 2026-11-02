import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// The one .env lives at the repo root; Prisma runs from apps/api.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});

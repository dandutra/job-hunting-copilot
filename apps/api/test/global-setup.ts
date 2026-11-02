import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { Client } from "pg";

// Tests get their own database so they can wipe tables without touching dev data.
export default async function globalSetup() {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error("DATABASE_URL is not set; copy .env.example to .env");

  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;

  const admin = new Client({ connectionString: base });
  await admin.connect();
  const found = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [testDb],
  );
  if (found.rowCount === 0) await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();

  url.pathname = `/${testDb}`;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "inherit",
  });
}

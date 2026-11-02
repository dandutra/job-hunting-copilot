import { existsSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service";

export function testDatabaseUrl(): string {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export async function openTestDb(): Promise<PrismaService> {
  const prisma = new PrismaService(testDatabaseUrl());
  await prisma.$connect();
  await prisma.company.deleteMany();
  return prisma;
}

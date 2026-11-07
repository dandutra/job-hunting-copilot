import { existsSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service";

export function testDatabaseUrl(): string {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

// Postings reference Companies without cascade, so they go first.
export async function resetTestDb(prisma: PrismaService): Promise<void> {
  await prisma.ingestCursor.deleteMany();
  await prisma.masterProfileVersion.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.company.deleteMany();
}

export async function openTestDb(): Promise<PrismaService> {
  const prisma = new PrismaService(testDatabaseUrl());
  await prisma.$connect();
  await resetTestDb(prisma);
  return prisma;
}

import { existsSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service";

export function testDatabaseUrl(): string {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

// Tailored resumes and Postings reference their parents without cascade, so they go first.
export async function resetTestDb(prisma: PrismaService): Promise<void> {
  await prisma.tailoredResume.deleteMany();
  await prisma.ingestCursor.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.company.deleteMany();
  await prisma.masterProfileVersion.deleteMany();
}

export async function openTestDb(): Promise<PrismaService> {
  const prisma = new PrismaService(testDatabaseUrl());
  await prisma.$connect();
  await resetTestDb(prisma);
  return prisma;
}

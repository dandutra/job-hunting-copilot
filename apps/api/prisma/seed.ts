import { existsSync, readFileSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  parseWatchedCsv,
  seedCompanies,
  WATCHED_COMPANIES_CSV,
} from "../src/companies/seed";

async function main() {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const prisma = new PrismaService();
  try {
    const counts = await seedCompanies(
      prisma,
      parseWatchedCsv(readFileSync(WATCHED_COMPANIES_CSV, "utf8")),
    );
    console.log(
      `Seeded: ${counts.rows} rows, ${counts.companies} companies, ${counts.watched} watched`,
    );
    if (counts.companies === 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

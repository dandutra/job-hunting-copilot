import { join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "./companies.service";

export const WATCHED_COMPANIES_CSV = join(
  __dirname,
  "../../../../docs/research/watched-companies.csv",
);

// ATSes whose boards have a public JSON API that an adapter can poll.
const POLLABLE_ATS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
]);

// Other spellings of the same employer. Subsidiaries never go here.
const SEED_ALIASES: Record<string, string[]> = {
  RBC: ["Royal Bank of Canada"],
  "TD Bank": ["Toronto-Dominion Bank"],
  BMO: ["Bank of Montreal"],
  CIBC: ["Canadian Imperial Bank of Commerce"],
  Scotiabank: ["Bank of Nova Scotia"],
};

export interface WatchedRow {
  company: string;
  ats: string;
  slug: string;
  verified: boolean;
}

export interface SeedCounts {
  rows: number;
  companies: number;
  watched: number;
}

const HEADER = ["company", "sector", "ats", "slug", "url", "verified"];

// The file has no quoted fields; a row with a comma inside a field fails loudly.
export function parseWatchedCsv(text: string): WatchedRow[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== HEADER.join(","))
    throw new Error(`Unexpected CSV header: ${lines[0]}`);

  const rows = lines.slice(1).flatMap((line, index) => {
    if (!line.trim()) return [];
    const fields = line.split(",");
    if (fields.length !== HEADER.length) {
      throw new Error(
        `CSV line ${index + 2} has ${fields.length} fields, expected ${HEADER.length}`,
      );
    }
    const [company, , ats, slug, , verified] = fields.map((f) => f.trim());
    return [{ company, ats, slug, verified: verified === "yes" }];
  });
  if (rows.length === 0) throw new Error("CSV has no rows");
  return rows;
}

export async function seedCompanies(
  prisma: PrismaService,
  rows: WatchedRow[],
): Promise<SeedCounts> {
  const companies = new CompaniesService(prisma);
  let watched = 0;

  for (const row of rows) {
    const company = await companies.resolveCompany(row.company);
    for (const alias of SEED_ALIASES[row.company] ?? [])
      await companies.addAlias(company.id, alias);

    const isWatched = row.verified && row.slug && POLLABLE_ATS.has(row.ats);
    // Clear the board too, so a row that lost its verification stops being polled.
    await prisma.company.update({
      where: { id: company.id },
      data: isWatched
        ? { ats: row.ats, boardSlug: row.slug }
        : { ats: null, boardSlug: null },
    });
    if (isWatched) watched++;
  }

  return {
    rows: rows.length,
    companies: await prisma.company.count(),
    watched,
  };
}

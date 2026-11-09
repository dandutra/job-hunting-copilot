import { PrismaService } from "../prisma/prisma.service";
import { openTestDb } from "../../test/test-db";
import { CompaniesService } from "./companies.service";
import { parseWatchedCsv, seedCompanies } from "./seed";

const CSV = `company,sector,ats,slug,url,verified
RBC,Bank,workday,rbc/RBCGLOBAL1,https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1,yes
Wealthsimple,Fintech,ashby,wealthsimple,https://jobs.ashbyhq.com/wealthsimple,yes
Scotiabank,Bank,successfactors,jobs.scotiabank.com,https://jobs.scotiabank.com/,yes
Shopify,Commerce platform,ashby,,https://www.shopify.com/careers,no
Bell,Telecom,phenom,jobs.bell.ca,https://jobs.bell.ca/ca/en,no
`;

describe("seedCompanies", () => {
  let prisma: PrismaService;
  let companies: CompaniesService;

  beforeAll(async () => {
    prisma = await openTestDb();
    companies = new CompaniesService(prisma);
  });
  beforeEach(() => prisma.company.deleteMany());
  afterAll(() => prisma.$disconnect());

  async function snapshot() {
    return prisma.company.findMany({
      orderBy: { name: "asc" },
      select: {
        name: true,
        ats: true,
        boardSlug: true,
        aliases: {
          select: { name: true, normalizedName: true },
          orderBy: { name: "asc" },
        },
      },
    });
  }

  it("creates a Company per row and a Watched company only for a verified, pollable board", async () => {
    const counts = await seedCompanies(prisma, parseWatchedCsv(CSV));

    expect(counts).toEqual({ rows: 5, companies: 5, watched: 2 });
    const rows = await snapshot();
    expect(
      rows.filter((c) => c.ats).map((c) => [c.name, c.ats, c.boardSlug]),
    ).toEqual([
      ["RBC", "workday", "rbc.wd3/RBCGLOBAL1"],
      ["Wealthsimple", "ashby", "wealthsimple"],
    ]);
  });

  it("gives the same rows when run twice", async () => {
    const rows = parseWatchedCsv(CSV);
    await seedCompanies(prisma, rows);
    const first = await snapshot();

    await seedCompanies(prisma, rows);

    expect(await snapshot()).toEqual(first);
  });

  it("clears the board of a row that is no longer verified", async () => {
    await seedCompanies(prisma, parseWatchedCsv(CSV));

    await seedCompanies(
      prisma,
      parseWatchedCsv(
        CSV.replace(
          "rbc/RBCGLOBAL1,https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1,yes",
          "rbc/RBCGLOBAL1,https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1,no",
        ),
      ),
    );

    const rbc = await prisma.company.findFirstOrThrow({
      where: { name: "RBC" },
    });
    expect([rbc.ats, rbc.boardSlug]).toEqual([null, null]);
  });

  it("resolves RBC and Royal Bank of Canada to one Company", async () => {
    await seedCompanies(prisma, parseWatchedCsv(CSV));

    const byShort = await companies.resolveCompany("RBC");
    const byLong = await companies.resolveCompany("Royal Bank of Canada");

    expect(byLong.id).toBe(byShort.id);
    expect(await prisma.company.count()).toBe(5);
  });

  it("aliases nothing beyond the seed names", async () => {
    await seedCompanies(prisma, parseWatchedCsv(CSV));

    const aliasNames = (await prisma.companyAlias.findMany())
      .map((a) => a.name)
      .sort();
    expect(aliasNames).toEqual([
      "Bank of Nova Scotia",
      "Bell",
      "RBC",
      "Royal Bank of Canada",
      "Scotiabank",
      "Shopify",
      "Wealthsimple",
    ]);
  });

  it("takes a Workday slug as tenant.wdN/site from the row's URL", () => {
    const rows = parseWatchedCsv(
      [
        "company,sector,ats,slug,url,verified",
        "RBC,Bank,workday,rbc/RBCGLOBAL1,https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1,yes",
        "Aviva,Insurer,workday,x,https://aviva.wd1.myworkdayjobs.com/en-US/External/,yes",
        "Odd,Bank,workday,odd/Site,https://careers.odd.example/jobs,yes",
        "Other,Bank,ashby,other,https://jobs.ashbyhq.com/other,yes",
      ].join("\n"),
    );

    expect(rows.map((r) => r.slug)).toEqual([
      "rbc.wd3/RBCGLOBAL1",
      "aviva.wd1/External",
      "",
      "other",
    ]);
  });

  it("rejects a row that does not have six fields", () => {
    expect(() =>
      parseWatchedCsv(
        'company,sector,ats,slug,url,verified\n"A, B",Bank,x,y,z,yes\n',
      ),
    ).toThrow(/line 2/);
  });

  it("rejects an empty file", () => {
    expect(() =>
      parseWatchedCsv("company,sector,ats,slug,url,verified\n"),
    ).toThrow(/no rows/);
  });
});

describe("the checked-in watched companies CSV", () => {
  it("seeds without errors and keeps every row", async () => {
    const { readFileSync } = await import("node:fs");
    const { WATCHED_COMPANIES_CSV } = await import("./seed");
    const prisma = await openTestDb();
    try {
      const rows = parseWatchedCsv(readFileSync(WATCHED_COMPANIES_CSV, "utf8"));
      const counts = await seedCompanies(prisma, rows);

      expect(counts.rows).toBe(99);
      expect(counts.companies).toBe(99);
      expect(counts.watched).toBeGreaterThan(0);
      const rbc = await new CompaniesService(prisma).resolveCompany(
        "Royal Bank of Canada",
      );
      expect(rbc.name).toBe("RBC");
    } finally {
      await prisma.$disconnect();
    }
  });
});

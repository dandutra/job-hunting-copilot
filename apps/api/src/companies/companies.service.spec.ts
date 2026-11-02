import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { openTestDb } from "../../test/test-db";
import { CompaniesService } from "./companies.service";

describe("CompaniesService", () => {
  let prisma: PrismaService;
  let companies: CompaniesService;

  beforeAll(async () => {
    prisma = await openTestDb();
    companies = new CompaniesService(prisma);
  });
  beforeEach(() => prisma.company.deleteMany());
  afterAll(() => prisma.$disconnect());

  describe("resolveCompany", () => {
    it("returns the Company that owns a known alias", async () => {
      const rbc = await prisma.company.create({
        data: {
          name: "RBC",
          aliases: { create: { name: "RBC", normalizedName: "rbc" } },
        },
      });

      expect((await companies.resolveCompany("RBC")).id).toBe(rbc.id);
    });

    it("resolves a normalized variant to the same Company", async () => {
      const acme = await companies.resolveCompany("Acme Inc");

      expect((await companies.resolveCompany("ACME Canada")).id).toBe(acme.id);
      expect((await companies.resolveCompany("acme, ltd.")).id).toBe(acme.id);
    });

    it("creates a Company for an unknown name, with that name as its first alias", async () => {
      const created = await companies.resolveCompany("Newco Corp");

      expect(created.name).toBe("Newco Corp");
      const aliases = await prisma.companyAlias.findMany({
        where: { companyId: created.id },
      });
      expect(aliases.map((a) => a.name)).toEqual(["Newco Corp"]);
      expect(await prisma.company.count()).toBe(1);
    });

    it("creates one Company when the same unknown name resolves concurrently", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => companies.resolveCompany("Racey Inc")),
      );

      expect(new Set(results.map((c) => c.id)).size).toBe(1);
      expect(await prisma.company.count()).toBe(1);
    });

    it("rejects a name that normalizes to nothing", async () => {
      await expect(companies.resolveCompany(" Inc. ")).rejects.toThrow();
      expect(await prisma.company.count()).toBe(0);
    });
  });

  describe("addAlias", () => {
    it("makes the new name resolve to the Company", async () => {
      const rbc = await companies.resolveCompany("RBC");

      await companies.addAlias(rbc.id, "Royal Bank of Canada");

      expect((await companies.resolveCompany("Royal Bank of Canada")).id).toBe(
        rbc.id,
      );
    });

    it("is a no-op when the Company already owns the alias", async () => {
      const rbc = await companies.resolveCompany("RBC");

      await companies.addAlias(rbc.id, "rbc inc");

      expect(
        await prisma.companyAlias.count({ where: { companyId: rbc.id } }),
      ).toBe(1);
    });

    it("rejects an alias that already belongs to another Company", async () => {
      const a = await companies.resolveCompany("Alpha");
      const b = await companies.resolveCompany("Beta");

      await expect(
        companies.addAlias(b.id, "Alpha Inc"),
      ).rejects.toBeInstanceOf(ConflictException);

      expect((await companies.resolveCompany("Alpha")).id).toBe(a.id);
      expect(
        await prisma.companyAlias.count({ where: { companyId: b.id } }),
      ).toBe(1);
    });

    it("rejects an unknown Company", async () => {
      await expect(companies.addAlias(999999, "Whoever")).rejects.toThrow();
    });
  });

  describe("findSimilarCompanies", () => {
    it("returns Companies with similar but unequal normalized names", async () => {
      const a = await companies.resolveCompany("Wealthsimple");
      await companies.resolveCompany("Shopify");

      const similar = await companies.findSimilarCompanies("Wealth Simple");

      expect(similar.map((c) => c.id)).toEqual([a.id]);
    });

    it("excludes the Company whose alias equals the normalized name", async () => {
      await companies.resolveCompany("Wealthsimple");

      expect(await companies.findSimilarCompanies("Wealthsimple Inc")).toEqual(
        [],
      );
    });

    it("lists a Company once however many of its aliases are similar", async () => {
      const a = await companies.resolveCompany("Wealthsimple");
      await companies.addAlias(a.id, "Wealthsimple Financial");

      const similar = await companies.findSimilarCompanies(
        "Wealth Simple Financial",
      );

      expect(similar.map((c) => c.id)).toEqual([a.id]);
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Company, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeName } from "./normalize-name";
import { similarity } from "./similarity";

const SIMILAR_AT_LEAST = 0.8;

// "Deloitte" against "Deloitte LLP" scores 0.78 on bigrams, so a whole-word prefix counts as similar too.
function startsWithWords(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(`${short} `);
}
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCompany(name: string): Promise<Company> {
    const normalizedName = this.requireNormalized(name);
    const known = await this.findByAlias(normalizedName);
    if (known) return known;

    try {
      return await this.prisma.company.create({
        data: {
          name: name.trim(),
          aliases: { create: { name: name.trim(), normalizedName } },
        },
      });
    } catch (error) {
      // A concurrent resolve of the same name created it first.
      const winner = isUniqueViolation(error)
        ? await this.findByAlias(normalizedName)
        : null;
      if (winner) return winner;
      throw error;
    }
  }

  async addAlias(companyId: number, name: string): Promise<void> {
    const normalizedName = this.requireNormalized(name);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException(`No Company ${companyId}`);

    const owner = await this.prisma.companyAlias.findUnique({
      where: { normalizedName },
    });
    if (owner) return this.assertOwnedBy(owner.companyId, companyId, name);

    try {
      await this.prisma.companyAlias.create({
        data: { companyId, name: name.trim(), normalizedName },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.prisma.companyAlias.findUniqueOrThrow({
        where: { normalizedName },
      });
      this.assertOwnedBy(raced.companyId, companyId, name);
    }
  }

  // Candidates for the Lookalike rule: close in spelling, never equal after normalizing.
  async findSimilarCompanies(name: string): Promise<Company[]> {
    const normalizedName = this.requireNormalized(name);
    const aliases = await this.prisma.companyAlias.findMany({
      include: { company: true },
    });

    const ownerOfExact = aliases.find(
      (a) => a.normalizedName === normalizedName,
    )?.companyId;
    const similar = new Map<number, Company>();
    for (const alias of aliases) {
      if (alias.companyId === ownerOfExact) continue;
      if (
        similarity(normalizedName, alias.normalizedName) >= SIMILAR_AT_LEAST ||
        startsWithWords(normalizedName, alias.normalizedName)
      ) {
        similar.set(alias.companyId, alias.company);
      }
    }
    return [...similar.values()];
  }

  private requireNormalized(name: string): string {
    const normalizedName = normalizeName(name);
    if (!normalizedName)
      throw new BadRequestException(`"${name}" is not a Company name`);
    return normalizedName;
  }

  private assertOwnedBy(
    ownerId: number,
    companyId: number,
    name: string,
  ): void {
    if (ownerId !== companyId) {
      throw new ConflictException(
        `"${name}" is already an alias of Company ${ownerId}`,
      );
    }
  }

  private async findByAlias(normalizedName: string): Promise<Company | null> {
    const alias = await this.prisma.companyAlias.findUnique({
      where: { normalizedName },
      include: { company: true },
    });
    return alias?.company ?? null;
  }
}

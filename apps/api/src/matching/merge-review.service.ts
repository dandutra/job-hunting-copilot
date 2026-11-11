import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeName } from "../companies/normalize-name";
import { PrismaService } from "../prisma/prisma.service";
import {
  LookalikeDto,
  MergeLogEntryDto,
  MergeResultDto,
  PostingSummaryDto,
  SplitResultDto,
} from "./merge-review.dto";
import { LOCKED_TRANSACTION, lockMatcher } from "./matcher-lock";
import { isNotSameAsAny, recordNotSame } from "./not-same";
import { absorbPosting } from "./posting-absorb";
import { refreshPosting } from "./posting-refresh";

type Tx = Prisma.TransactionClient;

const postingInclude = {
  company: true,
  sightings: { orderBy: { id: "asc" } },
} satisfies Prisma.PostingInclude;

type PostingWithParts = Prisma.PostingGetPayload<{
  include: typeof postingInclude;
}>;

function summarize(posting: PostingWithParts): PostingSummaryDto {
  return {
    id: posting.id,
    title: posting.title,
    location: posting.location,
    company: { id: posting.company.id, name: posting.company.name },
    sightings: posting.sightings.map((s) => ({
      id: s.id,
      jobSource: s.jobSource,
      url: s.url,
    })),
  };
}

@Injectable()
export class MergeReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listMergeLog(filter: {
    rule?: string;
    reviewed?: string;
  }): Promise<MergeLogEntryDto[]> {
    const reviewedFilter = {
      true: { not: null },
      false: null,
    } as const;
    const { reviewed } = filter;
    if (reviewed !== undefined && reviewed !== "true" && reviewed !== "false")
      throw new BadRequestException("reviewed must be true or false");
    const entries = await this.prisma.mergeLogEntry.findMany({
      where: {
        rule: filter.rule || undefined,
        reviewedAt:
          reviewed === undefined ? undefined : reviewedFilter[reviewed],
      },
      orderBy: [
        { reviewedAt: { sort: "asc", nulls: "first" } },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      include: { posting: { include: postingInclude } },
    });
    return entries.map((e) => this.entryDto(e, e.posting));
  }

  async markReviewed(id: number): Promise<MergeLogEntryDto> {
    // Only an unreviewed row is written, so a second call keeps the first timestamp.
    await this.prisma.mergeLogEntry.updateMany({
      where: { id, reviewedAt: null },
      data: { reviewedAt: new Date() },
    });
    const entry = await this.prisma.mergeLogEntry.findUnique({
      where: { id },
      include: { posting: { include: postingInclude } },
    });
    if (!entry) throw new NotFoundException(`No merge log entry ${id}`);
    return this.entryDto(entry, entry.posting);
  }

  async split(sightingId: number): Promise<SplitResultDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockMatcher(tx);
      const sighting = await tx.sighting.findUnique({
        where: { id: sightingId },
      });
      if (!sighting) throw new NotFoundException(`No Sighting ${sightingId}`);
      const held = await tx.sighting.count({
        where: { postingId: sighting.postingId },
      });
      if (held < 2)
        throw new ConflictException(
          "The Sighting is the only one on its Posting, so there is nothing to split.",
        );

      const detached = await tx.posting.create({
        data: {
          companyId: sighting.companyId,
          title: sighting.title,
          location: sighting.location,
          description: sighting.description,
          descriptionKind: sighting.descriptionKind,
          postedAt: sighting.reportedAt,
        },
      });
      await tx.sighting.update({
        where: { id: sighting.id },
        data: { postingId: detached.id },
      });
      await recordNotSame(tx, sighting.postingId, detached.id, "split");
      await refreshPosting(tx, sighting.postingId);
      await refreshPosting(tx, detached.id);
      return {
        postingId: detached.id,
        originalPostingId: sighting.postingId,
      };
    }, LOCKED_TRANSACTION);
  }

  async listLookalikes(): Promise<LookalikeDto[]> {
    const links = await this.prisma.lookalike.findMany({
      orderBy: { id: "asc" },
      include: {
        lowPosting: { include: postingInclude },
        highPosting: { include: postingInclude },
      },
    });
    return links.map((l) => ({
      id: l.id,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
      postings: [summarize(l.lowPosting), summarize(l.highPosting)],
    }));
  }

  async mergeLookalike(id: number): Promise<MergeResultDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockMatcher(tx);
      const link = await this.findLookalike(tx, id);
      if (await isNotSameAsAny(tx, link.lowPostingId, [link.highPostingId]))
        throw new ConflictException(
          "The user already said these Postings are different openings.",
        );
      const survivor = await tx.posting.findUniqueOrThrow({
        where: { id: link.lowPostingId },
        include: { company: true },
      });
      const absorbed = await tx.posting.findUniqueOrThrow({
        where: { id: link.highPostingId },
        include: { company: true },
      });
      const crossed = survivor.companyId !== absorbed.companyId;
      if (crossed)
        await this.mergeCompanies(tx, survivor.companyId, absorbed.companyId);

      await absorbPosting(tx, absorbed.id, survivor.id);
      await tx.mergeLogEntry.create({
        data: {
          rule: "manual_merge",
          evidence: {
            lookalikeId: link.id,
            reason: link.reason,
            companyNames: crossed
              ? [survivor.company.name, absorbed.company.name]
              : [survivor.company.name],
          },
          postingId: survivor.id,
          absorbedPostingId: absorbed.id,
          // The user made this merge by hand, so there is nothing left to review.
          reviewedAt: new Date(),
        },
      });
      await refreshPosting(tx, survivor.id);
      return { postingId: survivor.id };
    }, LOCKED_TRANSACTION);
  }

  async dismissLookalike(id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockMatcher(tx);
      const link = await this.findLookalike(tx, id);
      await recordNotSame(
        tx,
        link.lowPostingId,
        link.highPostingId,
        "dismissed",
      );
      await tx.lookalike.delete({ where: { id } });
    }, LOCKED_TRANSACTION);
  }

  private async findLookalike(tx: Tx, id: number) {
    const link = await tx.lookalike.findUnique({ where: { id } });
    if (!link) throw new NotFoundException(`No Lookalike ${id}`);
    return link;
  }

  // The user judged two company names to be one employer, so the names must resolve to one Company from now on.
  private async mergeCompanies(tx: Tx, preferredId: number, otherId: number) {
    const [preferred, other] = await Promise.all([
      tx.company.findUniqueOrThrow({ where: { id: preferredId } }),
      tx.company.findUniqueOrThrow({ where: { id: otherId } }),
    ]);
    const watched = (c: { ats: string | null }) => c.ats !== null;
    if (watched(preferred) && watched(other))
      throw new ConflictException(
        "Both Companies are Watched companies, so their names can't be joined.",
      );
    // A Watched company keeps its board, so it is the one that stays.
    const [keep, drop] =
      watched(other) && !watched(preferred)
        ? [other, preferred]
        : [preferred, other];

    await tx.posting.updateMany({
      where: { companyId: drop.id },
      data: { companyId: keep.id },
    });
    await tx.sighting.updateMany({
      where: { companyId: drop.id },
      data: { companyId: keep.id },
    });
    await tx.sighting.updateMany({
      where: { watchedCompanyId: drop.id },
      data: { watchedCompanyId: keep.id },
    });
    await tx.companyAlias.updateMany({
      where: { companyId: drop.id },
      data: { companyId: keep.id },
    });
    const normalizedName = normalizeName(drop.name);
    if (normalizedName)
      await tx.companyAlias.upsert({
        where: { normalizedName },
        create: { companyId: keep.id, name: drop.name, normalizedName },
        update: {},
      });
    await tx.company.delete({ where: { id: drop.id } });
  }

  private entryDto(
    entry: Prisma.MergeLogEntryGetPayload<object>,
    posting: PostingWithParts,
  ): MergeLogEntryDto {
    return {
      id: entry.id,
      rule: entry.rule,
      evidence: entry.evidence as Record<string, unknown>,
      createdAt: entry.createdAt.toISOString(),
      reviewedAt: entry.reviewedAt?.toISOString() ?? null,
      sightingId: entry.sightingId,
      absorbedPostingId: entry.absorbedPostingId,
      posting: summarize(posting),
    };
  }
}

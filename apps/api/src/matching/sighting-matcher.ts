import { Injectable } from "@nestjs/common";
import { Posting, Prisma, Sighting } from "@prisma/client";
import { CompaniesService } from "../companies/companies.service";
import { PrismaService } from "../prisma/prisma.service";
import { boardOf, normalizeListingKey, parseListingKey } from "./listing-key";
import { MatchingHooks } from "./matching-hooks";
import { kindRank, precedenceOf, SightingDraft } from "./sighting-draft";

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export interface MatchResult {
  posting: Posting;
  sighting: Sighting;
}

interface MatchOptions {
  // The poll time. Tests pass it to move across the 30-day window.
  now?: Date;
}

interface PendingLog {
  rule: "shared_listing_key" | "direct_url";
  evidence: Prisma.InputJsonObject;
  absorbedPostingId?: number;
}

function keysOf(sightings: Sighting[]): string[] {
  return sightings.flatMap((s) =>
    s.directKey ? [s.listingKey, s.directKey] : [s.listingKey],
  );
}

// Two different keys on one board are two listings, so they never share a Posting.
function conflicts(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x !== y && boardOf(x) === boardOf(y)));
}

@Injectable()
export class SightingMatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly hooks: MatchingHooks,
  ) {}

  async matchSighting(
    draft: SightingDraft,
    options: MatchOptions = {},
  ): Promise<MatchResult> {
    const now = options.now ?? new Date();
    const listingKey = normalizeListingKey(draft.listingKey);
    const directKey = this.directKeyOf(draft, listingKey);
    const companyId =
      draft.watchedCompanyId ??
      (await this.companies.resolveCompany(draft.companyName)).id;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const keys = [listingKey, ...(directKey ? [directKey] : [])].sort();
      for (const key of keys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      }
      return this.matchInTransaction(tx, {
        draft,
        listingKey,
        directKey,
        companyId,
        now,
      });
    });

    if (outcome.upgraded) await this.hooks.descriptionUpgraded(outcome.posting);
    return { posting: outcome.posting, sighting: outcome.sighting };
  }

  // A directUrl on the draft's own board would link two listings of one board.
  private directKeyOf(draft: SightingDraft, listingKey: string): string | null {
    const key = draft.directUrl ? parseListingKey(draft.directUrl) : null;
    if (!key || key === listingKey) return null;
    return boardOf(key) === boardOf(listingKey) ? null : key;
  }

  private async matchInTransaction(
    tx: Tx,
    input: {
      draft: SightingDraft;
      listingKey: string;
      directKey: string | null;
      companyId: number;
      now: Date;
    },
  ) {
    const { draft, listingKey, directKey, companyId, now } = input;
    const cutoff = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const active = { lastSeenAt: { gte: cutoff } };
    const draftKeys = directKey ? [listingKey, directKey] : [listingKey];

    const existing = await tx.sighting.findFirst({
      where: { jobSource: draft.jobSource, listingKey, ...active },
      orderBy: { lastSeenAt: "desc" },
    });

    const matches = await tx.sighting.findMany({
      where: {
        ...active,
        id: existing ? { not: existing.id } : undefined,
        OR: [
          { listingKey: { in: draftKeys } },
          { directKey: { in: draftKeys } },
        ],
      },
      orderBy: { id: "asc" },
    });

    const candidateIds = [...new Set(matches.map((s) => s.postingId))].filter(
      (id) => id !== existing?.postingId,
    );
    let survivorId = existing?.postingId ?? null;
    const logs: PendingLog[] = [];
    let joinLog: PendingLog | null = null;

    for (const candidateId of candidateIds) {
      const candidateSightings = await tx.sighting.findMany({
        where: { postingId: candidateId, ...active },
      });
      const candidateKeys = keysOf(candidateSightings);
      const evidence = this.evidenceFor(
        matches.filter((s) => s.postingId === candidateId),
        draft,
        listingKey,
        directKey,
      );

      if (survivorId === null) {
        if (conflicts(draftKeys, candidateKeys)) continue;
        survivorId = candidateId;
        joinLog = evidence;
        continue;
      }
      const survivorKeys = keysOf(
        await tx.sighting.findMany({
          where: { postingId: survivorId, ...active },
        }),
      );
      if (
        conflicts(survivorKeys, candidateKeys) ||
        conflicts(draftKeys, candidateKeys)
      )
        continue;
      logs.push({ ...evidence, absorbedPostingId: candidateId });
    }

    const before = survivorId
      ? await tx.posting.findUniqueOrThrow({ where: { id: survivorId } })
      : null;

    if (survivorId === null) {
      const created = await tx.posting.create({
        data: {
          companyId,
          title: draft.title,
          location: draft.location,
          description: "",
          descriptionKind: "none",
          postedAt: draft.reportedAt,
        },
      });
      survivorId = created.id;
    }
    const homeId = survivorId;

    for (const log of logs) {
      await this.absorb(tx, log.absorbedPostingId!, homeId);
    }

    const sighting = existing
      ? await this.refreshSighting(tx, existing, input)
      : await tx.sighting.create({
          data: {
            postingId: homeId,
            jobSource: draft.jobSource,
            listingKey,
            directKey,
            url: draft.url,
            reportedAt: draft.reportedAt,
            companyId,
            companyName: draft.companyName,
            title: draft.title,
            location: draft.location,
            description: draft.description,
            descriptionKind: draft.descriptionKind,
            directUrl: draft.directUrl ?? null,
            watchedCompanyId: draft.watchedCompanyId ?? null,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });

    if (!existing && joinLog) logs.push(joinLog);
    for (const log of logs) {
      await tx.mergeLogEntry.create({
        data: {
          rule: log.rule,
          evidence: log.evidence,
          postingId: homeId,
          sightingId: log.absorbedPostingId ? null : sighting.id,
          absorbedPostingId: log.absorbedPostingId ?? null,
        },
      });
    }

    const posting = await this.refreshPosting(tx, homeId);
    const wasFull = before?.descriptionKind === "full";
    return {
      posting,
      sighting,
      upgraded: !wasFull && posting.descriptionKind === "full",
    };
  }

  private evidenceFor(
    matched: Sighting[],
    draft: SightingDraft,
    listingKey: string,
    directKey: string | null,
  ): PendingLog {
    const shared = matched.find((s) => s.listingKey === listingKey);
    if (shared) {
      return {
        rule: "shared_listing_key",
        evidence: {
          key: listingKey,
          matchedJobSources: matched.map((s) => s.jobSource),
          draftJobSource: draft.jobSource,
        },
      };
    }
    return {
      rule: "direct_url",
      evidence: {
        key: directKey ?? listingKey,
        directUrl: draft.directUrl ?? matched[0]?.directUrl ?? null,
        matchedJobSources: matched.map((s) => s.jobSource),
        draftJobSource: draft.jobSource,
      },
    };
  }

  private async absorb(tx: Tx, fromId: number, intoId: number) {
    await tx.sighting.updateMany({
      where: { postingId: fromId },
      data: { postingId: intoId },
    });
    await tx.mergeLogEntry.updateMany({
      where: { postingId: fromId },
      data: { postingId: intoId },
    });
    await tx.posting.delete({ where: { id: fromId } });
  }

  private refreshSighting(
    tx: Tx,
    existing: Sighting,
    input: {
      draft: SightingDraft;
      directKey: string | null;
      companyId: number;
      now: Date;
    },
  ) {
    const { draft, directKey, companyId, now } = input;
    // A poll that returns less text must not erase what an earlier one found.
    const keepsText =
      kindRank(draft.descriptionKind) < kindRank(existing.descriptionKind);
    return tx.sighting.update({
      where: { id: existing.id },
      data: {
        url: draft.url,
        reportedAt:
          draft.reportedAt < existing.reportedAt
            ? draft.reportedAt
            : existing.reportedAt,
        companyId,
        companyName: draft.companyName,
        title: draft.title,
        location: draft.location,
        ...(keepsText
          ? {}
          : {
              description: draft.description,
              descriptionKind: draft.descriptionKind,
            }),
        directUrl: draft.directUrl ?? existing.directUrl,
        directKey: directKey ?? existing.directKey,
        watchedCompanyId: draft.watchedCompanyId ?? existing.watchedCompanyId,
        lastSeenAt: now,
      },
    });
  }

  // Fields come from the highest-precedence Sighting. The description comes from the
  // highest-precedence one that has full text, then snippet, so a bare alert never erases it.
  private async refreshPosting(tx: Tx, postingId: number): Promise<Posting> {
    const sightings = await tx.sighting.findMany({ where: { postingId } });
    const ranked = [...sightings].sort(
      (a, b) =>
        precedenceOf(a.jobSource) - precedenceOf(b.jobSource) || a.id - b.id,
    );
    const top = ranked[0];
    const textSource =
      ranked.find((s) => s.descriptionKind === "full") ??
      ranked.find((s) => s.descriptionKind === "snippet") ??
      top;
    const postedAt = sightings.reduce(
      (earliest, s) => (s.reportedAt < earliest ? s.reportedAt : earliest),
      top.reportedAt,
    );
    return tx.posting.update({
      where: { id: postingId },
      data: {
        companyId: top.companyId,
        title: top.title,
        location: top.location,
        description: textSource.description,
        descriptionKind: textSource.descriptionKind,
        postedAt,
      },
    });
  }
}

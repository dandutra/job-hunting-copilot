import { BadRequestException, Injectable } from "@nestjs/common";
import { Posting, Prisma, Sighting } from "@prisma/client";
import { CompaniesService } from "../companies/companies.service";
import { PrismaService } from "../prisma/prisma.service";
import { boardOf, normalizeListingKey, parseListingKey } from "./listing-key";
import { MatchingHooks } from "./matching-hooks";
import { kindRank, precedenceOf, SightingDraft } from "./sighting-draft";

export const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MATCHER_LOCK_ID = 2300023;
const TRANSACTION_TIMEOUT_MS = 60_000;

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
    if (!listingKey) throw new BadRequestException("Blank listing key");
    const directKey = this.directKeyOf(draft, listingKey);
    const companyId =
      draft.watchedCompanyId ??
      (await this.companies.resolveCompany(draft.companyName)).id;

    // Merges reach Postings beyond the draft's keys, so one lock serialises every match.
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MATCHER_LOCK_ID}::bigint)`;
        return this.matchInTransaction(tx, {
          draft,
          listingKey,
          directKey,
          companyId,
          now,
        });
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS },
    );

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
    const { draft, listingKey, companyId, now } = input;
    const cutoff = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const active = { lastSeenAt: { gte: cutoff } };

    const existing = await tx.sighting.findFirst({
      where: { jobSource: draft.jobSource, listingKey, ...active },
      orderBy: { lastSeenAt: "desc" },
    });

    // A quiet Sighting still holds its key, so the veto reads every Sighting.
    const keysOnPosting = async (postingId: number) =>
      keysOf(await tx.sighting.findMany({ where: { postingId } }));

    let survivorId = existing?.postingId ?? null;
    const held = survivorId ? await keysOnPosting(survivorId) : [];
    let directKey =
      input.directKey && !conflicts([input.directKey], held)
        ? input.directKey
        : null;
    const draftKeys = () =>
      directKey ? [listingKey, directKey] : [listingKey];

    const matches = await tx.sighting.findMany({
      where: {
        ...active,
        id: existing ? { not: existing.id } : undefined,
        OR: [
          { listingKey: { in: draftKeys() } },
          { directKey: { in: draftKeys() } },
        ],
      },
      orderBy: { id: "asc" },
    });
    const viaListingKey = (s: Sighting) =>
      s.listingKey === listingKey || s.directKey === listingKey;
    const candidateIds = [
      ...new Set(
        [...matches.filter(viaListingKey), ...matches].map((s) => s.postingId),
      ),
    ].filter((id) => id !== existing?.postingId);

    const absorbs: (PendingLog & { absorbedPostingId: number })[] = [];
    let joinLog: PendingLog | null = null;

    for (const candidateId of candidateIds) {
      const matched = matches.filter((s) => s.postingId === candidateId);
      const ownMatch = matched.some(viaListingKey);
      if (!ownMatch && !directKey) continue;
      const candidateKeys = await keysOnPosting(candidateId);
      const evidence = this.evidenceFor(matched, draft, listingKey, directKey);

      if (survivorId === null) {
        const joining = ownMatch ? [listingKey] : draftKeys();
        if (conflicts(joining, candidateKeys)) continue;
        survivorId = candidateId;
        held.push(...candidateKeys);
        if (directKey && conflicts([directKey], held)) directKey = null;
        joinLog = evidence;
        continue;
      }
      if (conflicts([...held, ...draftKeys()], candidateKeys)) continue;
      held.push(...candidateKeys);
      absorbs.push({ ...evidence, absorbedPostingId: candidateId });
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

    for (const { absorbedPostingId } of absorbs) {
      await this.absorb(tx, absorbedPostingId, homeId);
    }

    const sighting = existing
      ? await this.refreshSighting(tx, existing, { ...input, directKey })
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
            directUrl: directKey ? draft.directUrl : null,
            watchedCompanyId: draft.watchedCompanyId ?? null,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });

    const logs: PendingLog[] = [...absorbs];
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
    const reverse = matched.find((s) => s.directKey === listingKey);
    return {
      rule: "direct_url",
      evidence: {
        key: reverse ? listingKey : directKey,
        directUrl: reverse?.directUrl ?? draft.directUrl ?? null,
        matchedJobSources: matched.map((s) => s.jobSource),
        draftJobSource: draft.jobSource,
      },
    };
  }

  private async absorb(tx: Tx, fromId: number, intoId: number) {
    // Same lock as the tailoring writes, taken before any row moves, so the two can't deadlock.
    await tx.$queryRaw`SELECT id FROM posting WHERE id IN (${fromId}, ${intoId}) ORDER BY id FOR UPDATE`;
    await tx.sighting.updateMany({
      where: { postingId: fromId },
      data: { postingId: intoId },
    });
    await tx.mergeLogEntry.updateMany({
      where: { postingId: fromId },
      data: { postingId: intoId },
    });
    await tx.tailoredResume.updateMany({
      where: { postingId: fromId },
      data: { postingId: intoId },
    });
    // A Posting has at most one open draft and one approved resume, so the newest of each wins.
    const newestFirst = {
      draft: [{ createdAt: "desc" }, { id: "desc" }],
      approved: [
        { approvedAt: { sort: "desc", nulls: "last" } },
        { id: "desc" },
      ],
    } satisfies Record<string, Prisma.TailoredResumeOrderByWithRelationInput[]>;
    for (const [status, orderBy] of Object.entries(newestFirst)) {
      const newest = await tx.tailoredResume.findFirst({
        where: { postingId: intoId, status },
        orderBy,
      });
      if (newest)
        await tx.tailoredResume.updateMany({
          where: { postingId: intoId, status, id: { not: newest.id } },
          data: { status: "superseded" },
        });
    }
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
        companyId:
          draft.watchedCompanyId ?? existing.watchedCompanyId ?? companyId,
        companyName: draft.companyName,
        title: draft.title,
        location: draft.location,
        ...(keepsText
          ? {}
          : {
              description: draft.description,
              descriptionKind: draft.descriptionKind,
            }),
        directUrl: directKey ? draft.directUrl : existing.directUrl,
        directKey: directKey ?? existing.directKey,
        watchedCompanyId: draft.watchedCompanyId ?? existing.watchedCompanyId,
        lastSeenAt: now,
        // Seen again inside the key window, so the listing is back.
        closedAt: null,
      },
    });
  }

  // Text falls back past the top Sighting, so a bare alert never erases a description.
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

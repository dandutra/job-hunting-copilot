import { BadRequestException, Injectable } from "@nestjs/common";
import { Posting, Prisma, Sighting } from "@prisma/client";
import { CompaniesService } from "../companies/companies.service";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeName } from "../companies/normalize-name";
import { boardOf, normalizeListingKey, parseListingKey } from "./listing-key";
import { conflicts, keysOf } from "./key-conflicts";
import { MatchingHooks } from "./matching-hooks";
import { lockMatcher } from "./matcher-lock";
import { isNotSameAsAny } from "./not-same";
import { absorbPosting } from "./posting-absorb";
import { refreshPosting } from "./posting-refresh";
import { applyTextRules } from "./text-merge";
import { kindRank, SightingDraft } from "./sighting-draft";

export const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
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
    const similarCompanyIds = normalizeName(draft.companyName)
      ? (await this.companies.findSimilarCompanies(draft.companyName))
          .map((c) => c.id)
          .filter((id) => id !== companyId)
      : [];

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await lockMatcher(tx);
        return this.matchInTransaction(tx, {
          draft,
          listingKey,
          directKey,
          companyId,
          similarCompanyIds,
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
      similarCompanyIds: number[];
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
    // The Postings this draft already joins; a "not the same" pair with any of them blocks a candidate.
    const members: number[] = survivorId === null ? [] : [survivorId];

    for (const candidateId of candidateIds) {
      if (await isNotSameAsAny(tx, candidateId, members)) continue;
      const matched = matches.filter((s) => s.postingId === candidateId);
      const ownMatch = matched.some(viaListingKey);
      if (!ownMatch && !directKey) continue;
      const candidateKeys = await keysOnPosting(candidateId);
      const evidence = this.evidenceFor(matched, draft, listingKey, directKey);

      if (survivorId === null) {
        const joining = ownMatch ? [listingKey] : draftKeys();
        if (conflicts(joining, candidateKeys)) continue;
        survivorId = candidateId;
        members.push(candidateId);
        held.push(...candidateKeys);
        if (directKey && conflicts([directKey], held)) directKey = null;
        joinLog = evidence;
        continue;
      }
      if (conflicts([...held, ...draftKeys()], candidateKeys)) continue;
      held.push(...candidateKeys);
      members.push(candidateId);
      absorbs.push({ ...evidence, absorbedPostingId: candidateId });
    }

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
      await absorbPosting(tx, absorbedPostingId, homeId);
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
          // An exact key is certain, so only text merges wait for review.
          reviewedAt: now,
        },
      });
    }

    const text = await applyTextRules(tx, {
      sighting,
      homeId,
      similarCompanyIds: input.similarCompanyIds,
      cutoff,
    });
    // The row is refreshed only below, so its kind is still what it was before this match.
    const before = await tx.posting.findUnique({ where: { id: text.homeId } });
    const posting = await refreshPosting(tx, text.homeId);
    return {
      posting,
      sighting: await tx.sighting.findUniqueOrThrow({
        where: { id: sighting.id },
      }),
      upgraded:
        before?.descriptionKind !== "full" &&
        posting.descriptionKind === "full",
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
}

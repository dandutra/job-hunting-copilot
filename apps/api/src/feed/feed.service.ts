import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Clock } from "../labels/labels-env";
import { PostingState, postingState } from "../matching/posting-state";
import { PrismaService } from "../prisma/prisma.service";
import { isThin } from "../tiers/compute-tier";
import { tierBreakdown } from "../tiers/breakdown";
import { TierConfigSource } from "./tier-config-source";
import {
  FeedItemDto,
  LinkDto,
  LookalikeHintDto,
  PostingDetailDto,
  WhyDto,
} from "./feed.dto";
import { TierValue } from "../labels/labels.dto";

const listInclude = {
  company: true,
  tier: true,
  sightings: {
    select: {
      jobSource: true,
      url: true,
      watchedCompanyId: true,
      lastSeenAt: true,
      closedAt: true,
    },
    orderBy: { id: "asc" },
  },
  feedCorrections: { orderBy: { id: "desc" }, take: 1 },
} satisfies Prisma.PostingInclude;

type Loaded = Prisma.PostingGetPayload<{ include: typeof listInclude }>;

const TIER_RANK = { A: 0, B: 1, C: 2 } as const;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly tierConfig: TierConfigSource,
  ) {}

  async list(include: string | undefined): Promise<FeedItemDto[]> {
    if (include !== undefined && include !== "closed")
      throw new BadRequestException("include must be closed");
    const now = this.clock.now();
    const rows = await this.prisma.posting.findMany({
      // A Posting with no Tier has no group to sit in until the next recompute.
      where: { tier: { isNot: null } },
      include: listInclude,
    });
    const shown = rows.filter(
      (p) => include === "closed" || postingState(p.sightings, now) === "open",
    );
    const looked = await this.lookalikeIds(shown.map((p) => p.id));
    return shown
      .map((p) => ({ p, tier: p.tier!.tier as TierValue }))
      .sort(
        (x, y) =>
          TIER_RANK[x.tier] - TIER_RANK[y.tier] ||
          y.p.postedAt.getTime() - x.p.postedAt.getTime() ||
          y.p.id - x.p.id,
      )
      .map(({ p, tier }) => ({
        ...this.core(p, now, looked.has(p.id)),
        tier,
      }));
  }

  async detail(id: number): Promise<PostingDetailDto> {
    const now = this.clock.now();
    const p = await this.prisma.posting.findUnique({
      where: { id },
      include: listInclude,
    });
    if (!p) throw new NotFoundException("Posting not found");
    const lookalikes = await this.lookalikeHints(id);
    const judgement = p.tier
      ? await this.prisma.jevJudgement.findUnique({
          where: { id: p.tier.judgementId },
        })
      : null;
    const breakdown = judgement ? this.breakdown(judgement.answers) : null;
    return {
      ...this.core(p, now, lookalikes.length > 0),
      tier: (p.tier?.tier as TierValue | undefined) ?? null,
      workArrangement: breakdown?.workArrangement ?? null,
      roleFamily: breakdown?.roleFamily ?? null,
      why: breakdown?.why ?? null,
      descriptionKind: p.descriptionKind,
      description: p.description,
      links: links(p.sightings),
      lookalikes,
    };
  }

  private core(p: Loaded, now: Date, hasLookalike: boolean) {
    const state: PostingState = postingState(p.sightings, now);
    return {
      id: p.id,
      title: p.title,
      company: p.company.name,
      location: p.location,
      postedAt: p.postedAt.toISOString(),
      sightingCount: p.sightings.length,
      thin: isThin(p),
      capsApplied: p.tier?.capsApplied ?? [],
      hasLookalike,
      feedCorrection: (p.feedCorrections[0]?.tier as TierValue) ?? null,
      state,
    };
  }

  // A stale or unreadable input costs the "Why" list, not the whole Posting.
  private breakdown(answers: unknown) {
    try {
      const config = this.tierConfig.load();
      const b = tierBreakdown(answers, config);
      if (!b) return null;
      const { thresholds } = config;
      const why: WhyDto = {
        total: b.total,
        thresholds,
        factors: b.factors,
      };
      return {
        why,
        roleFamily: b.roleFamily,
        workArrangement: b.workArrangement,
      };
    } catch (e) {
      this.logger.error(`tier breakdown failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async lookalikeIds(ids: number[]): Promise<Set<number>> {
    const rows = await this.prisma.lookalike.findMany({
      where: {
        OR: [{ lowPostingId: { in: ids } }, { highPostingId: { in: ids } }],
      },
      select: { lowPostingId: true, highPostingId: true },
    });
    return new Set(rows.flatMap((r) => [r.lowPostingId, r.highPostingId]));
  }

  private async lookalikeHints(id: number): Promise<LookalikeHintDto[]> {
    const rows = await this.prisma.lookalike.findMany({
      where: { OR: [{ lowPostingId: id }, { highPostingId: id }] },
      include: {
        lowPosting: { include: { company: true, tier: true } },
        highPosting: { include: { company: true, tier: true } },
      },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => {
      const other = r.lowPostingId === id ? r.highPosting : r.lowPosting;
      return {
        id: r.id,
        reason: r.reason,
        other: {
          id: other.id,
          title: other.title,
          company: other.company.name,
          location: other.location,
          tier: (other.tier?.tier as TierValue | undefined) ?? null,
        },
      };
    });
  }
}

function links(sightings: { jobSource: string; url: string }[]): LinkDto[] {
  const byUrl = new Map<string, string[]>();
  for (const s of sightings) {
    const sources = byUrl.get(s.url) ?? [];
    if (!sources.includes(s.jobSource)) sources.push(s.jobSource);
    byUrl.set(s.url, sources);
  }
  return [...byUrl].map(([url, jobSources]) => ({ url, jobSources }));
}

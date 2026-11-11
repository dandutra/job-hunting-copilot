import { createHash } from "node:crypto";
import { QUESTION_SET_VERSION } from "../src/jev/question-set";
import { Clock, Random } from "../src/labels/labels-env";
import { PrismaService } from "../src/prisma/prisma.service";

export const LOGIN = "tester@example.com";
export const CONFIG_VERSION = "cfg-1";

export class FakeClock extends Clock {
  at = new Date("2026-12-01T15:00:00Z");
  now(): Date {
    return new Date(this.at);
  }
}

// mulberry32: the same seed gives the same draw, so a "seeded run" is repeatable.
export class SeededRandom extends Random {
  constructor(private state: number) {
    super();
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export interface SeedOptions {
  tier: "A" | "B" | "C";
  caps?: string[];
  kind?: "full" | "snippet" | "none";
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  closedAt?: Date;
  title?: string;
  location?: string;
  company?: string;
  postedAt?: Date;
  answers?: object;
}

let seq = 0;

// A Posting with one Sighting, one judgement and a stored Tier, the way the pipeline leaves it.
export async function seedPosting(prisma: PrismaService, o: SeedOptions) {
  seq++;
  const profile = createHash("sha256").update("profile").digest("hex");
  await prisma.masterProfileVersion.upsert({
    where: { id: profile },
    create: { id: profile, rawYaml: "x" },
    update: {},
  });
  const company = await prisma.company.create({
    data: { name: o.company ?? `Company ${seq}` },
  });
  const firstSeen = o.firstSeenAt ?? new Date("2026-11-20T12:00:00Z");
  const posting = await prisma.posting.create({
    data: {
      companyId: company.id,
      title: o.title ?? `Developer ${seq}`,
      location: o.location ?? "Toronto, ON",
      description: `Full text ${seq}`,
      descriptionKind: o.kind ?? "full",
      postedAt: o.postedAt ?? firstSeen,
    },
  });
  await prisma.sighting.create({
    data: {
      postingId: posting.id,
      jobSource: "greenhouse",
      listingKey: `greenhouse:c${seq}:${seq}`,
      url: `https://example.com/${seq}`,
      reportedAt: firstSeen,
      companyId: company.id,
      companyName: company.name,
      title: posting.title,
      location: posting.location,
      description: posting.description,
      descriptionKind: posting.descriptionKind,
      firstSeenAt: firstSeen,
      lastSeenAt: o.lastSeenAt ?? firstSeen,
      closedAt: o.closedAt ?? null,
    },
  });
  const judgement = await prisma.jevJudgement.create({
    data: {
      postingId: posting.id,
      profileVersionId: profile,
      questionSetVersion: QUESTION_SET_VERSION,
      descriptionKind: posting.descriptionKind,
      model: "jev-test",
      answers: o.answers ?? {},
    },
  });
  await prisma.postingTier.create({
    data: {
      postingId: posting.id,
      judgementId: judgement.id,
      configVersion: CONFIG_VERSION,
      tier: o.tier,
      total: 0.5,
      capsApplied: o.caps ?? [],
    },
  });
  return posting.id;
}

export async function seedMany(
  prisma: PrismaService,
  tier: "A" | "B" | "C",
  n: number,
  o: Partial<SeedOptions> = {},
) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++)
    ids.push(await seedPosting(prisma, { tier, ...o }));
  return ids;
}

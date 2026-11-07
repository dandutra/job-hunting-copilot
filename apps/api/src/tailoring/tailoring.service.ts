import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type DraftSection,
  type Line,
  type Profile,
  type TailoredDraft,
  type TraceFailure,
  TailoredDraftSchema,
  traceCheck,
  validateProfile,
} from "master-profile";
import { PrismaService } from "../prisma/prisma.service";
import type {
  RejectDto,
  RejectLineDto,
  ResumeStatusDto,
  ReviewDto,
  TailoredResumeDto,
  TailoringInputDto,
  VerdictDto,
} from "./tailoring.dto";

type Failure = Omit<TraceFailure, "rule"> & { rule: TraceFailure["rule"] | 6 };
type StoredDraft = Omit<TailoredDraft, "postingText">;
type Loaded = { id: string; profile: Profile };

const staleVersion = (
  detail = "is not the latest Master profile version",
): Failure => ({
  rule: 6,
  location: "profileVersion",
  detail,
});

const NOT_OPEN = "The draft is no longer open";

const VERDICT_STATUSES = ["pass", "do-not-claim", "overstatement"];

// Locations match the Trace check's, so a failure and a verdict name a line the same way.
function linesOf(draft: StoredDraft): { location: string; line: Line }[] {
  const out = draft.summary.map((line, i) => ({
    location: `summary[${i}]`,
    line,
  }));
  for (const [key, sections] of [
    ["experiences", draft.experiences],
    ["projects", draft.projects],
  ] as const)
    sections.forEach((section, i) =>
      section.bullets.forEach((line, j) =>
        out.push({ location: `${key}[${i}].bullets[${j}]`, line }),
      ),
    );
  draft.coverLetter?.forEach((line, i) =>
    out.push({ location: `coverLetter[${i}]`, line }),
  );
  return out;
}

function entryLabels(profile: Profile): Map<string, string> {
  const labels = new Map<string, string>();
  for (const e of profile.experiences)
    labels.set(e.id, `${e.employer}, ${e.titles.join(" / ")}`);
  for (const p of profile.projects) labels.set(p.id, p.name);
  for (const d of profile.education)
    labels.set(d.id, `${d.school}, ${d.program}`);
  for (const s of profile.skills) labels.set(s.id, s.name);
  for (const f of profile.facts) labels.set(f.id, f.text);
  return labels;
}

function omit<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

// Serializes submits and approves per Posting, so it never holds two open drafts or two approved resumes.
// 0 rows means a merge deleted the Posting after our read, and the drafts now live on the survivor.
async function lockPosting(tx: Prisma.TransactionClient, postingId: number) {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT id FROM posting WHERE id = ${postingId} FOR UPDATE`;
  if (rows.length === 0)
    throw new ConflictException(
      "The Posting was merged into another; find the surviving Posting and retry",
    );
}

// Drafts stored before #59 hold the summary as one line, not a list of Highlights.
function upgradeDraft(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.summary)) return value;
  return { ...value, summary: [value.summary] };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

@Injectable()
export class TailoringService {
  private readonly logger = new Logger(TailoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async input(postingId: number): Promise<TailoringInputDto> {
    const posting = await this.findPosting(postingId);
    const latest = await this.latest();
    if (!latest)
      throw new ConflictException("No Master profile version is stored");
    const { profile } = latest;
    const rejected = await this.prisma.tailoredResume.findMany({
      where: { postingId, status: "rejected" },
      orderBy: { createdAt: "asc" },
    });
    return {
      posting: {
        id: posting.id,
        title: posting.title,
        company: posting.company.name,
        location: posting.location,
        text: posting.description,
        ats: posting.company.ats,
        thin: posting.descriptionKind !== "full",
      },
      profileVersion: latest.id,
      experiences: profile.experiences
        .filter((e) => !e.retired)
        .map((e) => omit(e, "retired")),
      facts: profile.facts
        .filter((f) => !f.retired)
        .map((f) => omit(f, "retired", "sources")),
      projects: profile.projects
        .filter((p) => !p.retired)
        .map((p) => omit(p, "retired")),
      education: profile.education
        .filter((d) => !d.retired)
        .map((d) => omit(d, "retired")),
      skills: profile.skills
        .filter((s) => !s.retired)
        .map((s) => omit(s, "retired")),
      doNotClaims: profile.do_not_claims,
      rejectNotes: rejected.map((r) => ({
        resumeId: r.id,
        note: r.rejectNote ?? "",
        lines: (r.rejectLines as RejectLineDto[] | null) ?? [],
      })),
    };
  }

  async submit(postingId: number, body: unknown): Promise<ResumeStatusDto> {
    await this.findPosting(postingId);
    const latest = await this.latest();
    if (!latest)
      throw this.rejection([
        staleVersion("no Master profile version is stored"),
      ]);

    const { profileVersion, ...rest } = isRecord(body)
      ? body
      : ({} as Record<string, unknown>);
    const failures: Failure[] = [];
    const result = traceCheck(latest.profile, isRecord(body) ? rest : body);
    if (!result.ok) failures.push(...result.failures);
    if (profileVersion !== latest.id) failures.push(staleVersion());
    if (failures.length > 0) {
      this.logger.warn(
        `Rejected a draft for Posting ${postingId}: ${failures.length} failing lines`,
      );
      throw this.rejection(failures);
    }

    const { postingText, ...draft } = TailoredDraftSchema.parse(rest);
    const created = await this.prisma.$transaction(async (tx) => {
      await lockPosting(tx, postingId);
      await tx.tailoredResume.updateMany({
        where: { postingId, status: "draft" },
        data: { status: "superseded" },
      });
      return tx.tailoredResume.create({
        data: {
          postingId,
          profileVersionId: latest.id,
          status: "draft",
          draft: draft as Prisma.InputJsonValue,
          postingText: postingText ?? null,
        },
      });
    });
    this.logger.log(`Stored draft ${created.id} for Posting ${postingId}`);
    return { id: created.id, status: created.status };
  }

  async review(id: number, dto: ReviewDto): Promise<ResumeStatusDto> {
    const { row, draft, profile } = await this.openDraft(id);
    const verdicts: unknown = dto?.verdicts;
    if (!Array.isArray(verdicts))
      throw new BadRequestException({
        errors: [{ line: "(body)", message: "verdicts must be a list" }],
      });
    const known = new Set(linesOf(draft).map((l) => l.location));
    const doNotClaims = new Set(profile.do_not_claims.map((x) => x.id));
    const seen = new Set<string>();
    const errors: { line: string; message: string }[] = [];
    verdicts.forEach((v: VerdictDto, i) => {
      const line = typeof v?.line === "string" ? v.line : `verdicts[${i}]`;
      const bad = (message: string) => errors.push({ line, message });
      if (typeof v?.line !== "string" || !known.has(v.line))
        return bad("is not a line of this draft");
      if (seen.has(v.line)) return bad("has more than one verdict");
      seen.add(v.line);
      if (!VERDICT_STATUSES.includes(v.status))
        return bad("status must be pass, do-not-claim or overstatement");
      if (v.status === "do-not-claim" && !doNotClaims.has(v.doNotClaimId ?? ""))
        bad("needs the ID of a Do-not-claim in the profile");
      if (
        v.status === "overstatement" &&
        !(typeof v.note === "string" && v.note.trim())
      )
        bad("needs a note");
    });
    if (errors.length > 0) throw new BadRequestException({ errors });

    const stored = (verdicts as VerdictDto[]).map((v) => ({
      line: v.line,
      status: v.status,
      ...(v.status === "do-not-claim" ? { doNotClaimId: v.doNotClaimId } : {}),
      ...(v.status === "overstatement" ? { note: v.note } : {}),
    }));
    const moved = await this.prisma.tailoredResume.updateMany({
      where: { id: row.id, status: "draft" },
      data: { verdicts: stored },
    });
    if (moved.count === 0) throw new ConflictException(NOT_OPEN);
    return { id: row.id, status: "draft" };
  }

  async approve(id: number): Promise<ResumeStatusDto> {
    const { row } = await this.openDraft(id);
    const latest = await this.latest();
    const failures: Failure[] = [];
    if (latest) {
      const result = traceCheck(latest.profile, upgradeDraft(row.draft));
      if (!result.ok) failures.push(...result.failures);
    }
    if (!latest || row.profileVersionId !== latest.id)
      failures.push(staleVersion());
    if (failures.length > 0) {
      this.logger.warn(
        `Draft ${id} no longer passes: ${failures.length} failing lines`,
      );
      throw this.rejection(failures);
    }
    await this.prisma.$transaction(async (tx) => {
      await lockPosting(tx, row.postingId);
      await tx.tailoredResume.updateMany({
        where: { postingId: row.postingId, status: "approved" },
        data: { status: "superseded" },
      });
      const moved = await tx.tailoredResume.updateMany({
        where: { id, status: "draft" },
        data: { status: "approved", approvedAt: new Date() },
      });
      // A concurrent approve or reject won; the throw rolls the supersede back.
      if (moved.count === 0) throw new ConflictException(NOT_OPEN);
    });
    this.logger.log(`Approved draft ${id} for Posting ${row.postingId}`);
    return { id, status: "approved" };
  }

  async reject(id: number, dto: RejectDto): Promise<ResumeStatusDto> {
    const { draft, profile } = await this.openDraft(id);
    const note: unknown = dto?.note;
    const lines: unknown = dto?.lines ?? [];
    const errors: { line: string; message: string }[] = [];
    if (typeof note !== "string" || note.trim() === "")
      errors.push({ line: "(body)", message: "note must be text" });
    if (!Array.isArray(lines))
      errors.push({ line: "(body)", message: "lines must be a list" });
    else {
      const known = new Set(linesOf(draft).map((l) => l.location));
      const doNotClaims = new Set(profile.do_not_claims.map((x) => x.id));
      (lines as RejectLineDto[]).forEach((l, i) => {
        const where = typeof l?.line === "string" ? l.line : `lines[${i}]`;
        if (typeof l?.line !== "string" || !known.has(l.line))
          errors.push({ line: where, message: "is not a line of this draft" });
        else if (
          l.doNotClaimId !== undefined &&
          !doNotClaims.has(l.doNotClaimId)
        )
          errors.push({
            line: where,
            message: "doNotClaimId is not in the profile",
          });
      });
    }
    if (errors.length > 0) throw new BadRequestException({ errors });

    const moved = await this.prisma.tailoredResume.updateMany({
      where: { id, status: "draft" },
      data: {
        status: "rejected",
        rejectNote: note as string,
        rejectLines: (lines as RejectLineDto[]).map((l) => ({
          line: l.line,
          ...(l.doNotClaimId ? { doNotClaimId: l.doNotClaimId } : {}),
        })),
      },
    });
    if (moved.count === 0) throw new ConflictException(NOT_OPEN);
    this.logger.log(`Rejected draft ${id}`);
    return { id, status: "rejected" };
  }

  // Never reads postingText: the Claim review uses this response as is.
  async get(id: number): Promise<TailoredResumeDto> {
    const row = await this.prisma.tailoredResume.findUnique({
      where: { id },
      include: {
        posting: { include: { company: true } },
        profileVersion: true,
      },
    });
    if (!row) throw new NotFoundException();
    const profile = this.parse(
      row.profileVersion.id,
      row.profileVersion.rawYaml,
    );
    const draft = this.storedDraft(row.id, row.draft);
    const labels = entryLabels(profile);
    const facts = new Map(profile.facts.map((f) => [f.id, f]));
    const view = (location: string, line: Line) => ({
      line: location,
      text: line.text,
      cites: line.cites.map((c) => {
        const fact = facts.get(c);
        return {
          id: c,
          text: labels.get(c) ?? "",
          ...(fact
            ? {
                ownership: fact.ownership,
                ...(fact.ownership_note
                  ? { ownershipNote: fact.ownership_note }
                  : {}),
              }
            : {}),
        };
      }),
    });
    const bullets = (key: string, section: DraftSection, i: number) =>
      section.bullets.map((b, j) => view(`${key}[${i}].bullets[${j}]`, b));

    const experiences = draft.experiences.flatMap((s, i) => {
      const e = profile.experiences.find((x) => x.id === s.id);
      return e
        ? [
            {
              id: e.id,
              employer: e.employer,
              titles: e.titles,
              start: e.start,
              end: e.end,
              location: e.location,
              fixed: e.fixed,
              bullets: bullets("experiences", s, i),
            },
          ]
        : [];
    });
    const projects = draft.projects.flatMap((s, i) => {
      const p = profile.projects.find((x) => x.id === s.id);
      return p
        ? [
            {
              id: p.id,
              name: p.name,
              links: p.links,
              repo: p.repo,
              bullets: bullets("projects", s, i),
            },
          ]
        : [];
    });
    const education = draft.educationIds.flatMap((eid) => {
      const d = profile.education.find((x) => x.id === eid);
      return d
        ? [
            {
              id: d.id,
              school: d.school,
              program: d.program,
              start: d.start,
              end: d.end,
            },
          ]
        : [];
    });
    const { contact } = profile;
    return {
      id: row.id,
      postingId: row.postingId,
      status: row.status,
      profileVersion: row.profileVersionId,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      contact,
      summary: draft.summary.map((l, i) => view(`summary[${i}]`, l)),
      experiences,
      projects,
      education,
      skills: draft.skills,
      doNotClaims: profile.do_not_claims.map(({ id, text }) => ({ id, text })),
      ...(draft.coverLetter
        ? {
            coverLetter: {
              greeting: `Dear ${row.posting.company.name} hiring team,`,
              paragraphs: draft.coverLetter.map((p, i) =>
                view(`coverLetter[${i}]`, p),
              ),
              signOff: `Sincerely,\n${contact.name}`,
            },
          }
        : {}),
      ...(row.verdicts
        ? { verdicts: row.verdicts as unknown as VerdictDto[] }
        : {}),
      ...(row.rejectNote !== null ? { rejectNote: row.rejectNote } : {}),
      ...(row.rejectLines
        ? { rejectLines: row.rejectLines as unknown as RejectLineDto[] }
        : {}),
    };
  }

  private rejection(failures: Failure[]) {
    return new UnprocessableEntityException({ failures });
  }

  private async findPosting(id: number) {
    const posting = await this.prisma.posting.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!posting) throw new NotFoundException();
    return posting;
  }

  private async openDraft(id: number) {
    const row = await this.prisma.tailoredResume.findUnique({
      where: { id },
      include: { profileVersion: true },
    });
    if (!row) throw new NotFoundException();
    if (row.status !== "draft")
      throw new ConflictException(`The draft is ${row.status}`);
    return {
      row,
      draft: this.storedDraft(row.id, row.draft),
      profile: this.parse(row.profileVersion.id, row.profileVersion.rawYaml),
    };
  }

  // safeParse, because a ZodError's message quotes the draft and Nest would log it.
  private storedDraft(id: number, value: Prisma.JsonValue): StoredDraft {
    const parsed = TailoredDraftSchema.safeParse(upgradeDraft(value));
    if (!parsed.success) {
      this.logger.error(`Stored draft ${id} no longer parses`);
      throw new InternalServerErrorException();
    }
    return parsed.data;
  }

  private async latest(): Promise<Loaded | null> {
    const row = await this.prisma.masterProfileVersion.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return row
      ? { id: row.id, profile: this.parse(row.id, row.rawYaml) }
      : null;
  }

  private parse(id: string, rawYaml: string): Profile {
    const result = validateProfile(rawYaml);
    if (!result.ok) {
      this.logger.error(
        `Master profile version ${id.slice(0, 12)} no longer validates`,
      );
      throw new InternalServerErrorException();
    }
    return result.profile;
  }
}

import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SightingDraft } from "../matching/sighting-draft";
import {
  AdapterError,
  AdapterResult,
  BoardReport,
  JobSourceAdapter,
  PollWindow,
} from "./job-source-adapter";
import { inSearchArea } from "./search-area";

export interface HttpResponse {
  status: number;
  // The raw text, parsed by the adapter so a bad body is a board error, not a crash.
  body: string;
}

export interface HttpClient {
  get(url: string, headers: Record<string, string>): Promise<HttpResponse>;
}

// Plain name, no email: the boards only need to tell us apart from a scraper.
export const USER_AGENT = "job-hunting-copilot/1.0";
const REQUEST_TIMEOUT_MS = 30_000;
export const BOARD_GAP_MS = 1_000;

export const fetchHttpClient: HttpClient = {
  async get(url, headers) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text() };
  },
};

export interface WatchedBoard {
  id: number;
  name: string;
  boardSlug: string;
}

// One row of a board's listing, already read from the ATS's JSON.
export interface BoardRow {
  id: string;
  url: string;
  title: string;
  locations: string[];
  description: string;
  postedAt: Date | null;
}

// Latin-1 plus the typographic names boards use; an unknown name is left as written.
const ENTITIES: Record<string, number> = {
  amp: 0x26,
  lt: 0x3c,
  gt: 0x3e,
  quot: 0x22,
  apos: 0x27,
  nbsp: 0xa0,
  iexcl: 0xa1,
  cent: 0xa2,
  pound: 0xa3,
  curren: 0xa4,
  yen: 0xa5,
  brvbar: 0xa6,
  sect: 0xa7,
  uml: 0xa8,
  copy: 0xa9,
  ordf: 0xaa,
  laquo: 0xab,
  not: 0xac,
  shy: 0xad,
  reg: 0xae,
  macr: 0xaf,
  deg: 0xb0,
  plusmn: 0xb1,
  sup2: 0xb2,
  sup3: 0xb3,
  acute: 0xb4,
  micro: 0xb5,
  para: 0xb6,
  middot: 0xb7,
  cedil: 0xb8,
  sup1: 0xb9,
  ordm: 0xba,
  raquo: 0xbb,
  frac14: 0xbc,
  frac12: 0xbd,
  frac34: 0xbe,
  iquest: 0xbf,
  Agrave: 0xc0,
  Aacute: 0xc1,
  Acirc: 0xc2,
  Atilde: 0xc3,
  Auml: 0xc4,
  Aring: 0xc5,
  AElig: 0xc6,
  Ccedil: 0xc7,
  Egrave: 0xc8,
  Eacute: 0xc9,
  Ecirc: 0xca,
  Euml: 0xcb,
  Igrave: 0xcc,
  Iacute: 0xcd,
  Icirc: 0xce,
  Iuml: 0xcf,
  ETH: 0xd0,
  Ntilde: 0xd1,
  Ograve: 0xd2,
  Oacute: 0xd3,
  Ocirc: 0xd4,
  Otilde: 0xd5,
  Ouml: 0xd6,
  times: 0xd7,
  Oslash: 0xd8,
  Ugrave: 0xd9,
  Uacute: 0xda,
  Ucirc: 0xdb,
  Uuml: 0xdc,
  Yacute: 0xdd,
  THORN: 0xde,
  szlig: 0xdf,
  agrave: 0xe0,
  aacute: 0xe1,
  acirc: 0xe2,
  atilde: 0xe3,
  auml: 0xe4,
  aring: 0xe5,
  aelig: 0xe6,
  ccedil: 0xe7,
  egrave: 0xe8,
  eacute: 0xe9,
  ecirc: 0xea,
  euml: 0xeb,
  igrave: 0xec,
  iacute: 0xed,
  icirc: 0xee,
  iuml: 0xef,
  eth: 0xf0,
  ntilde: 0xf1,
  ograve: 0xf2,
  oacute: 0xf3,
  ocirc: 0xf4,
  otilde: 0xf5,
  ouml: 0xf6,
  divide: 0xf7,
  oslash: 0xf8,
  ugrave: 0xf9,
  uacute: 0xfa,
  ucirc: 0xfb,
  uuml: 0xfc,
  yacute: 0xfd,
  thorn: 0xfe,
  yuml: 0xff,
  OElig: 0x152,
  oelig: 0x153,
  Scaron: 0x160,
  scaron: 0x161,
  Yuml: 0x178,
  fnof: 0x192,
  circ: 0x2c6,
  tilde: 0x2dc,
  ensp: 0x2002,
  emsp: 0x2003,
  thinsp: 0x2009,
  zwnj: 0x200c,
  zwj: 0x200d,
  lrm: 0x200e,
  rlm: 0x200f,
  ndash: 0x2013,
  mdash: 0x2014,
  lsquo: 0x2018,
  rsquo: 0x2019,
  sbquo: 0x201a,
  ldquo: 0x201c,
  rdquo: 0x201d,
  bdquo: 0x201e,
  dagger: 0x2020,
  Dagger: 0x2021,
  bull: 0x2022,
  hellip: 0x2026,
  permil: 0x2030,
  prime: 0x2032,
  Prime: 0x2033,
  lsaquo: 0x2039,
  rsaquo: 0x203a,
  euro: 0x20ac,
  trade: 0x2122,
  larr: 0x2190,
  uarr: 0x2191,
  rarr: 0x2192,
  darr: 0x2193,
  harr: 0x2194,
  minus: 0x2212,
  infin: 0x221e,
  asymp: 0x2248,
  ne: 0x2260,
  le: 0x2264,
  ge: 0x2265,
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : whole;
    }
    // Case matters: &Eacute; and &eacute; are different letters.
    const point = ENTITIES[code] ?? ENTITIES[code.toLowerCase()];
    return point === undefined ? whole : String.fromCodePoint(point);
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// An untyped JSON object; every field is read through str() or dateOrNull(), which check the type.
export interface Raw {
  [key: string]: Raw;
}

// The seed CSV copies slugs from board URLs, so some arrive already percent-encoded ("PAR%20Technology").
export function slugPath(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // A stray "%" is part of the slug, not an escape.
  }
  return encodeURIComponent(decoded);
}

// A remote flag only adds "Remote, {place}", so the place still decides the Search area; with no place it is plain "Remote".
export function withRemote(locations: string[]): string[] {
  return locations.length
    ? [...locations, ...locations.map((l) => `Remote, ${l}`)]
    : ["Remote"];
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function dateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Rows a board returned, or a message when the body is not what the ATS documents.
export type ParsedBoard = { rows: unknown[] } | string;

// Shared poll loop for the ATS boards: one request per Watched company, spaced out, each board isolated.
export abstract class BoardAdapter extends JobSourceAdapter {
  protected abstract readonly ats: "greenhouse" | "lever" | "ashby";
  protected abstract url(slug: string): string;
  protected abstract parseBody(json: unknown): ParsedBoard;
  // Returns the row, or null for a row that is not a listing (Ashby's unlisted jobs).
  protected abstract readRow(
    raw: unknown,
    slug: string,
  ): BoardRow | null | string;

  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    private readonly prisma: Pick<PrismaService, "company">,
    private readonly http: HttpClient = fetchHttpClient,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    super();
  }

  get name(): string {
    return this.ats;
  }

  async poll(window: PollWindow): Promise<AdapterResult> {
    const companies = await this.prisma.company.findMany({
      where: { ats: this.ats, boardSlug: { not: null } },
      orderBy: { id: "asc" },
    });
    const result: AdapterResult = {
      drafts: [],
      errors: [],
      boards: [],
      completeBoards: [],
    };
    let first = true;
    for (const company of companies) {
      const board = { ...company, boardSlug: company.boardSlug! };
      if (window.shouldStop()) {
        result.boards!.push({
          watchedCompanyId: board.id,
          status: "incomplete",
        });
        continue;
      }
      if (!first) await this.sleep(BOARD_GAP_MS);
      first = false;
      const report = await this.pollBoard(board, window.now, result);
      result.boards!.push(report);
    }
    return result;
  }

  private async pollBoard(
    board: WatchedBoard,
    now: Date,
    result: AdapterResult,
  ): Promise<BoardReport> {
    const fail = (error: Omit<AdapterError, "watchedCompanyId">) => {
      result.errors.push({ ...error, watchedCompanyId: board.id });
      return { watchedCompanyId: board.id, status: "failed" } as const;
    };
    let res: HttpResponse;
    try {
      res = await this.http.get(this.url(board.boardSlug), {
        "user-agent": USER_AGENT,
        accept: "application/json",
      });
    } catch (err) {
      const cause = err instanceof Error ? (err.cause ?? err) : err;
      return fail({
        kind: "fault",
        message: `${board.name}: request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
    if (res.status === 429 || res.status === 403) {
      return fail({
        kind: "blocked",
        httpStatus: res.status,
        message: `${board.name}: board answered ${res.status}`,
      });
    }
    if (res.status !== 200) {
      return fail({
        kind: "fault",
        httpStatus: res.status,
        message: `${board.name}: board answered ${res.status}`,
      });
    }
    let parsed: ParsedBoard;
    try {
      parsed = this.parseBody(JSON.parse(res.body));
    } catch {
      parsed = "body is not JSON";
    }
    if (typeof parsed === "string") {
      return fail({
        kind: "fault",
        message: `${board.name}: ${parsed}`,
      });
    }

    let outside = 0;
    let unreadable = false;
    let readable = 0;
    for (const raw of parsed.rows) {
      const row = this.readRow(raw, board.boardSlug);
      if (row === null) continue;
      if (typeof row === "string") {
        unreadable = true;
        result.errors.push({
          kind: "bad-row",
          watchedCompanyId: board.id,
          message: `${board.name}: row skipped: ${row}`,
        });
        continue;
      }
      // A lost location field would make every row look out of area, and that board would then close all its jobs.
      if (row.locations.length === 0) {
        unreadable = true;
        result.errors.push({
          kind: "bad-row",
          watchedCompanyId: board.id,
          message: `${board.name}: row skipped: location is missing`,
        });
        continue;
      }
      readable++;
      if (!inSearchArea(row.locations)) {
        outside++;
        continue;
      }
      result.drafts.push(this.toDraft(board, row, now));
    }
    if (outside > 0) {
      this.logger.log(
        `${board.name}: dropped ${outside} of ${readable} rows outside the Search area`,
      );
    }
    // A row we could not read may still be listed, so this read cannot close anything.
    if (!unreadable) result.completeBoards.push(board.id);
    return {
      watchedCompanyId: board.id,
      status: "ok",
      rows: readable,
    };
  }

  private toDraft(
    board: WatchedBoard,
    row: BoardRow,
    now: Date,
  ): SightingDraft {
    return {
      jobSource: this.ats,
      listingKey: `${this.ats}:${board.boardSlug}:${row.id}`.toLowerCase(),
      url: row.url,
      reportedAt: row.postedAt ?? now,
      companyName: board.name,
      title: row.title,
      location: row.locations.join("; "),
      description: row.description,
      descriptionKind: row.description ? "full" : "none",
      watchedCompanyId: board.id,
    };
  }
}

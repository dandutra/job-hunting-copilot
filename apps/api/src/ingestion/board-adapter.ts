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

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
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
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// An untyped JSON object; every field is read through str() or dateOrNull(), which check the type.
export interface Raw {
  [key: string]: Raw;
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

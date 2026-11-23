import { Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SightingDraft } from "../../matching/sighting-draft";
import { WINDOW_DAYS } from "../../matching/sighting-matcher";
import {
  BOARD_GAP_MS,
  HttpClient,
  HttpResponse,
  USER_AGENT,
  dateOrNull,
  fetchHttpClient,
  htmlToText,
  slugPath,
  str,
  withRemote,
} from "../board-adapter";
import {
  AdapterResult,
  BoardReport,
  JobSourceAdapter,
  PollWindow,
} from "../job-source-adapter";
import { inSearchArea } from "../search-area";

const PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEADERS = { "user-agent": USER_AGENT, accept: "application/json" };
// The order the career page shows them in.
const SECTIONS = [
  "companyDescription",
  "jobDescription",
  "qualifications",
  "additionalInformation",
];

interface Board {
  id: number;
  name: string;
  boardSlug: string;
}

interface Fields {
  url: string;
  reportedAt: Date;
  title: string;
  location: string;
  description: string;
  descriptionKind: string;
}

type Obj = Record<string, unknown>;

// Thrown by the request gate when shutdown has begun; the board is then incomplete, not failed.
class Stopped extends Error {}

class BoardFailure extends Error {
  constructor(
    readonly kind: "blocked" | "fault",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

// The list call carries no description, so a poll spends a detail call only on an in-area row it has no Sighting for.
export class SmartRecruitersAdapter extends JobSourceAdapter {
  readonly name = "smartrecruiters";

  private readonly logger = new Logger(SmartRecruitersAdapter.name);

  constructor(
    private readonly prisma: Pick<PrismaService, "company" | "sighting">,
    private readonly http: HttpClient = fetchHttpClient,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    super();
  }

  async poll(window: PollWindow): Promise<AdapterResult> {
    const companies = await this.prisma.company.findMany({
      where: { ats: "smartrecruiters", boardSlug: { not: null } },
      orderBy: { id: "asc" },
    });
    const result: AdapterResult = {
      drafts: [],
      errors: [],
      boards: [],
      completeBoards: [],
    };
    // One request at a time across boards, each 1 s after the last.
    let first = true;
    const request = async (url: string): Promise<HttpResponse> => {
      if (window.shouldStop()) throw new Stopped();
      if (!first) await this.sleep(BOARD_GAP_MS);
      first = false;
      return this.http.get(url, HEADERS);
    };
    for (const company of companies) {
      const board = { ...company, boardSlug: company.boardSlug! };
      result.boards!.push(
        await this.pollBoard(board, window.now, request, result),
      );
    }
    return result;
  }

  private async pollBoard(
    board: Board,
    now: Date,
    request: (url: string) => Promise<HttpResponse>,
    result: AdapterResult,
  ): Promise<BoardReport> {
    const api = `https://api.smartrecruiters.com/v1/companies/${slugPath(board.boardSlug)}/postings`;
    let unreadable = false;
    const badRow = (message: string) => {
      unreadable = true;
      result.errors.push({
        kind: "bad-row",
        watchedCompanyId: board.id,
        message: `${board.name}: row skipped: ${message}`,
      });
    };

    try {
      const rows = await this.list(api, request);
      // An unknown company id answers 200 with no jobs, the same as a real board that closed everything.
      if (rows.length === 0) {
        this.logger.warn(
          `${board.name}: board returned 0 jobs, check the slug "${board.boardSlug}"`,
        );
      }
      const keyOf = (id: string) =>
        `smartrecruiters:${board.boardSlug}:${id}`.toLowerCase();
      const stored = await this.storedSightings(
        rows.flatMap((r) => str(r.id) ?? []).map(keyOf),
        now,
      );
      let readable = 0;
      let outside = 0;
      for (const row of rows) {
        const id = str(row.id);
        if (!id) {
          badRow("id is missing");
          continue;
        }
        const locations = locationsOf(row.location as Obj | undefined);
        // A lost location field would make every row look out of area, and that board would then close all its jobs.
        if (locations.length === 0) {
          badRow("location is missing");
          continue;
        }
        readable++;
        if (!inSearchArea(locations)) {
          outside++;
          continue;
        }
        const key = keyOf(id);
        const known = stored.get(key);
        if (known) {
          // The list title costs nothing, and a board can retitle a listed job.
          result.drafts.push(
            this.draft(board, key, {
              ...known,
              title: str(row.name) ?? known.title,
            }),
          );
          continue;
        }
        const detail = await this.detail(request, `${api}/${slugPath(id)}`);
        if (typeof detail === "string") {
          badRow(detail);
          continue;
        }
        result.drafts.push(
          this.draft(board, key, {
            url:
              detail.url ??
              `https://jobs.smartrecruiters.com/${board.boardSlug}/${id}`,
            reportedAt: dateOrNull(row.releasedDate) ?? now,
            title: str(row.name) ?? detail.title ?? "",
            location: locations.join("; "),
            description: detail.description,
            descriptionKind: detail.description ? "full" : "none",
          }),
        );
      }
      if (outside > 0) {
        this.logger.log(
          `${board.name}: dropped ${outside} of ${readable} rows outside the Search area`,
        );
      }
      // A row we could not read may still be listed, so this read cannot close anything.
      if (!unreadable) result.completeBoards.push(board.id);
      return { watchedCompanyId: board.id, status: "ok", rows: readable };
    } catch (err) {
      if (err instanceof Stopped)
        return { watchedCompanyId: board.id, status: "incomplete" };
      const failure =
        err instanceof BoardFailure
          ? err
          : new BoardFailure("fault", `request failed: ${causeOf(err)}`);
      result.errors.push({
        kind: failure.kind,
        watchedCompanyId: board.id,
        message: `${board.name}: ${failure.message}`,
        ...(failure.httpStatus === undefined
          ? {}
          : { httpStatus: failure.httpStatus }),
      });
      return { watchedCompanyId: board.id, status: "failed" };
    }
  }

  // Every row of the board once. A row seen on two pages (a job posted mid-walk shifts the offsets) counts once.
  private async list(
    api: string,
    request: (url: string) => Promise<HttpResponse>,
  ): Promise<Obj[]> {
    const rows = new Map<string, Obj>();
    const loose: Obj[] = [];
    let total = 0;
    for (let offset = 0; offset === 0 || offset < total; offset += PAGE_SIZE) {
      const res = await request(`${api}?limit=${PAGE_SIZE}&offset=${offset}`);
      refuse(res);
      let json: { totalFound?: unknown; content?: unknown } | null;
      try {
        json = JSON.parse(res.body);
      } catch {
        throw new BoardFailure("fault", "body is not JSON");
      }
      if (
        !Array.isArray(json?.content) ||
        typeof json?.totalFound !== "number"
      ) {
        throw new BoardFailure(
          "fault",
          "body has no content list or totalFound",
        );
      }
      total = json.totalFound;
      for (const raw of json.content as Obj[]) {
        const id = str(raw?.id);
        if (id === null) loose.push(raw ?? {});
        else rows.set(id, raw);
      }
    }
    return [...rows.values(), ...loose];
  }

  // A string is the reason one row is unreadable.
  private async detail(
    request: (url: string) => Promise<HttpResponse>,
    url: string,
  ): Promise<
    { url: string | null; title: string | null; description: string } | string
  > {
    let res: HttpResponse;
    try {
      res = await request(url);
    } catch (err) {
      if (err instanceof Stopped) throw err;
      return `detail call failed: ${causeOf(err)}`;
    }
    if (res.status === 429 || res.status === 403) refuse(res);
    // A 404 is a listing that closed after the list call, not a fault.
    if (res.status !== 200) return `detail call answered ${res.status}`;
    let json: Obj | null;
    try {
      json = JSON.parse(res.body);
    } catch {
      return "detail body is not JSON";
    }
    if (!json || typeof json !== "object") return "detail has no body";
    const sections = ((json.jobAd as Obj | undefined)?.sections ?? {}) as Obj;
    return {
      url: str(json.postingUrl),
      title: str(json.name),
      description: SECTIONS.map((s) =>
        htmlToText(str((sections[s] as Obj | undefined)?.text) ?? ""),
      )
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  // Only Sightings the matcher would still join, so a repost after 30 quiet days gets fresh fields.
  private async storedSightings(keys: string[], now: Date) {
    const found = new Map<string, Fields>();
    if (keys.length === 0) return found;
    const rows = await this.prisma.sighting.findMany({
      where: {
        jobSource: "smartrecruiters",
        listingKey: { in: keys },
        lastSeenAt: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY_MS) },
      },
      orderBy: { lastSeenAt: "desc" },
    });
    for (const s of rows)
      if (!found.has(s.listingKey)) found.set(s.listingKey, s);
    return found;
  }

  private draft(board: Board, key: string, f: Fields): SightingDraft {
    return {
      jobSource: "smartrecruiters",
      listingKey: key,
      url: f.url,
      reportedAt: f.reportedAt,
      companyName: board.name,
      title: f.title,
      location: f.location,
      description: f.description,
      descriptionKind: f.descriptionKind as SightingDraft["descriptionKind"],
      watchedCompanyId: board.id,
    };
  }
}

// The location object has a country code in lower case ("ca"), which `inSearchArea` would not read as Canada, so the place comes from fullLocation.
function locationsOf(location: Obj | undefined): string[] {
  const place =
    str(location?.fullLocation) ??
    [str(location?.city), str(location?.region)].filter(Boolean).join(", ");
  if (!place) return [];
  return location?.remote === true ? withRemote([place]) : [place];
}

function refuse(res: HttpResponse): void {
  if (res.status === 429 || res.status === 403) {
    throw new BoardFailure(
      "blocked",
      `board answered ${res.status}`,
      res.status,
    );
  }
  if (res.status !== 200) {
    throw new BoardFailure("fault", `board answered ${res.status}`, res.status);
  }
}

function causeOf(err: unknown): string {
  const cause = err instanceof Error ? (err.cause ?? err) : err;
  return cause instanceof Error ? cause.message : String(cause);
}

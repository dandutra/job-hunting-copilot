import { Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeListingKey } from "../../matching/listing-key";
import { SightingDraft } from "../../matching/sighting-draft";
import { WINDOW_DAYS } from "../../matching/sighting-matcher";
import {
  HttpResponse,
  USER_AGENT,
  dateOrNull,
  htmlToText,
  slugPath,
  str,
} from "../board-adapter";
import {
  AdapterResult,
  BoardReport,
  JobSourceAdapter,
  PollWindow,
} from "../job-source-adapter";
import { inSearchArea } from "../search-area";

export interface WorkdayHttp {
  get(url: string, headers: Record<string, string>): Promise<HttpResponse>;
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<HttpResponse>;
}

const REQUEST_TIMEOUT_MS = 30_000;

export const fetchWorkdayHttp: WorkdayHttp = {
  async get(url, headers) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text() };
  },
  async post(url, body, headers) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text() };
  },
};

const PAGE_SIZE = 20;
// Some tenants refuse to page past 2000 results, so a bigger tenant can never be read in full.
const RESULT_CAP = 2000;
export const REQUEST_GAP_MS = 1_500;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLUG = /^([a-z0-9-]+)\.(wd\d+)\/([^/]+)$/i;
const MANY_LOCATIONS = /^\d+\s+locations?$/i;

interface Facet {
  facetParameter?: unknown;
  descriptor?: unknown;
  id?: unknown;
  values?: unknown;
}

// Facets nest (Manulife wraps its locations in a group), so the Canada value is found at any depth.
interface CanadaFilter {
  applied: Record<string, string[]>;
  // The facet's own job count, a check on the filtered total.
  count: number | null;
  // Only a country facet surely covers every Canadian job, so only it can make a tenant complete.
  country: boolean;
}

// Nvidia has no country facet and files Canada under locationHierarchy1, so any facet with a "Canada" value is the fallback.
function canadaFilter(facets: unknown): CanadaFilter | null {
  const found: { name: string; id: string; count: number | null }[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const facet of list as Facet[]) {
      const name = str(facet?.facetParameter);
      const canada = Array.isArray(facet?.values)
        ? (facet.values as Facet[]).find(
            (v) => str(v?.descriptor)?.toLowerCase() === "canada" && str(v?.id),
          )
        : undefined;
      if (name && canada) {
        const count = (canada as { count?: unknown }).count;
        found.push({
          name,
          id: str(canada.id)!,
          count: typeof count === "number" ? count : null,
        });
      }
      walk(facet?.values);
    }
  };
  walk(facets);
  const country = found.find((f) => /country/i.test(f.name));
  // A location record can also be named "Canada"; the country-level value counts the most jobs.
  const pick =
    country ?? [...found].sort((a, b) => (b.count ?? -1) - (a.count ?? -1))[0];
  if (!pick) return null;
  return {
    applied: { [pick.name]: [pick.id] },
    count: pick.count,
    country: pick === country,
  };
}

interface Tenant {
  id: number;
  name: string;
  boardSlug: string;
}

type Request = <T>(send: () => Promise<T>) => Promise<T>;

// Thrown by the request gate when shutdown has begun; the tenant is then incomplete, not failed.
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

interface ListPage {
  total: number;
  postings: unknown[];
  facets: unknown;
}

interface Detail {
  title: string | null;
  url: string | null;
  postedAt: Date | null;
  locations: string[];
  description: string;
}

interface Fields {
  url: string;
  reportedAt: Date;
  title: string;
  location: string;
  description: string;
  descriptionKind: string;
}

const JSON_HEADERS = {
  "user-agent": USER_AGENT,
  accept: "application/json",
};

// Workday's list call pages at 20, wraps past `total` and has only relative dates, so a poll walks one
// tenant at a time and spends a detail call only on a row it cannot judge from storage.
export class WorkdayAdapter extends JobSourceAdapter {
  readonly name = "workday";
  readonly minIntervalMs = 3 * 60 * 60 * 1000;

  private readonly logger = new Logger(WorkdayAdapter.name);
  // Keys judged outside the Search area: one detail call each for the life of the process.
  private readonly judgedOut = new Set<string>();

  constructor(
    private readonly prisma: Pick<PrismaService, "company" | "sighting">,
    private readonly http: WorkdayHttp = fetchWorkdayHttp,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    super();
  }

  async poll(window: PollWindow): Promise<AdapterResult> {
    const companies = await this.prisma.company.findMany({
      where: { ats: "workday", boardSlug: { not: null } },
      orderBy: { id: "asc" },
    });
    const result: AdapterResult = {
      drafts: [],
      errors: [],
      boards: [],
      completeBoards: [],
    };
    // One request at a time across tenants, each 1.5 s after the last.
    let first = true;
    const request: Request = async (send) => {
      if (window.shouldStop()) throw new Stopped();
      if (!first) await this.sleep(REQUEST_GAP_MS);
      first = false;
      return send();
    };

    for (const company of companies) {
      const tenant = { ...company, boardSlug: company.boardSlug! };
      result.boards!.push(
        await this.pollTenant(tenant, window.now, request, result),
      );
    }
    return result;
  }

  private async pollTenant(
    tenant: Tenant,
    now: Date,
    request: Request,
    result: AdapterResult,
  ): Promise<BoardReport> {
    const failed = { watchedCompanyId: tenant.id, status: "failed" } as const;
    const parts = SLUG.exec(tenant.boardSlug);
    if (!parts) {
      result.errors.push({
        kind: "fault",
        watchedCompanyId: tenant.id,
        message: `${tenant.name}: slug "${tenant.boardSlug}" is not tenant.wdN/site`,
      });
      return failed;
    }
    const [, name, wd, site] = parts;
    const host = `https://${name}.${wd}.myworkdayjobs.com`;
    const api = `${host}/wday/cxs/${name}/${slugPath(site)}`;

    let readable = 0;
    let unreadable = false;
    let outside = 0;
    const badRow = (message: string) => {
      unreadable = true;
      result.errors.push({
        kind: "bad-row",
        watchedCompanyId: tenant.id,
        message: `${tenant.name}: row skipped: ${message}`,
      });
    };

    try {
      const rows = await this.walk(tenant, api, request, badRow);
      const stored = await this.storedSightings(
        rows.list.map((r) => r.key),
        now,
      );
      for (const { path, key, posting } of rows.list) {
        // Some tenants (Thomson Reuters) send no locationsText, so the detail call judges those rows.
        const where = str(posting.locationsText) ?? "";
        readable++;
        if (this.judgedOut.has(key)) {
          outside++;
          continue;
        }
        const many = !where || MANY_LOCATIONS.test(where);
        // A stored Sighting already passed the area test, which only a single named place can change.
        const known = stored.get(key);
        if (known && (many || inSearchArea([where]))) {
          result.drafts.push(
            this.draft(tenant, key, {
              ...known,
              // The list title costs nothing, and Workday retitles a listed job.
              title: str(posting.title) ?? known.title,
            }),
          );
          continue;
        }
        if (!many && !inSearchArea([where])) {
          outside++;
          continue;
        }

        const detail = await this.detail(request, `${api}${path}`);
        if (typeof detail === "string") {
          badRow(detail);
          continue;
        }
        if (!inSearchArea(detail.locations)) {
          this.judgedOut.add(key);
          outside++;
          continue;
        }
        result.drafts.push(
          this.draft(tenant, key, {
            url: detail.url ?? `${host}/${slugPath(site)}${path}`,
            reportedAt: detail.postedAt ?? now,
            title: str(posting.title) ?? detail.title ?? "",
            location: detail.locations.join("; "),
            description: detail.description,
            descriptionKind: detail.description ? "full" : "none",
          }),
        );
      }
      if (outside > 0) {
        this.logger.log(
          `${tenant.name}: dropped ${outside} of ${readable} rows outside the Search area`,
        );
      }
      // Only a full, trusted walk with every row read may close a Sighting.
      if (!unreadable && rows.complete) result.completeBoards.push(tenant.id);
      return { watchedCompanyId: tenant.id, status: "ok", rows: readable };
    } catch (err) {
      if (err instanceof Stopped)
        return { watchedCompanyId: tenant.id, status: "incomplete" };
      const failure =
        err instanceof BoardFailure
          ? err
          : new BoardFailure("fault", `request failed: ${causeOf(err)}`);
      result.errors.push({
        kind: failure.kind,
        watchedCompanyId: tenant.id,
        message: `${tenant.name}: ${failure.message}`,
        ...(failure.httpStatus === undefined
          ? {}
          : { httpStatus: failure.httpStatus }),
      });
      return failed;
    }
  }

  // Every posting of the tenant once, by path. Page one gives total and facets, and the walk stops at total because later pages wrap.
  private async walk(
    tenant: Tenant,
    api: string,
    request: Request,
    badRow: (message: string) => void,
  ) {
    const tenantKey = SLUG.exec(tenant.boardSlug)![1].toLowerCase();
    const seen = new Set<string>();
    const list: {
      path: string;
      key: string;
      posting: Record<string, unknown>;
    }[] = [];
    const collect = (postings: unknown[]) => {
      for (const raw of postings) {
        const posting = (raw ?? {}) as Record<string, unknown>;
        const path = str(posting.externalPath);
        if (!path) {
          badRow("externalPath is missing");
          continue;
        }
        if (seen.has(path)) continue;
        seen.add(path);
        // The slug keeps the first title, so the requisition id after the last "_" is the key.
        const slug = path.split("/").pop() ?? "";
        const requisition = slug.slice(slug.lastIndexOf("_") + 1);
        if (!slug.includes("_") || !requisition) {
          badRow("the path has no requisition id");
          continue;
        }
        list.push({
          path,
          key: normalizeListingKey(`workday:${tenantKey}:${requisition}`),
          posting,
        });
      }
    };
    const page = async (
      offset: number,
      appliedFacets: Record<string, string[]>,
    ) =>
      readList(
        await request(() =>
          this.http.post(
            `${api}/jobs`,
            JSON.stringify({
              appliedFacets,
              limit: PAGE_SIZE,
              offset,
              searchText: "",
            }),
            { ...JSON_HEADERS, "content-type": "application/json" },
          ),
        ),
      );

    const head = await page(0, {});
    collect(head.postings);
    let total = head.total;
    let trusted = true;
    // Page one is unfiltered, so a filtered walk restarts at offset 0 rather than skip rows the filter would put on page one.
    const filter = canadaFilter(head.facets);
    if (filter) {
      const filtered = await page(0, filter.applied);
      collect(filtered.postings);
      // A bad filtered total would end the walk early and close the jobs it missed, so it must agree with both counts.
      if (
        filtered.total > head.total ||
        filter.count === null ||
        filtered.total < filter.count
      ) {
        trusted = false;
        this.logger.warn(
          `${tenant.name}: filtered total ${filtered.total} disagrees with the Canada count ${filter.count} or the total ${head.total}, so this read is not complete`,
        );
      } else {
        total = filtered.total;
        if (!filter.country) trusted = false;
      }
    }
    // A capped query reports exactly 2000, so 2000 itself cannot be trusted as a full count.
    if (total >= RESULT_CAP) {
      this.logger.warn(
        `${tenant.name}: total ${total} reaches the ${RESULT_CAP} cap, so this board is never complete`,
      );
    }
    const end = Math.min(total, RESULT_CAP);
    for (let offset = PAGE_SIZE; offset < end; offset += PAGE_SIZE) {
      collect((await page(offset, filter?.applied ?? {})).postings);
    }
    return { list, complete: trusted && total < RESULT_CAP };
  }

  // Detail rows are judged and filled here; a string is the reason one row is unreadable.
  private async detail(
    request: Request,
    url: string,
  ): Promise<Detail | string> {
    let res: HttpResponse;
    try {
      res = await request(() => this.http.get(url, JSON_HEADERS));
    } catch (err) {
      if (err instanceof Stopped) throw err;
      return `detail call failed: ${causeOf(err)}`;
    }
    // S22 is a listing that closed after the list call, not a block.
    if (res.status === 403 && isGone(res.body))
      return "the listing closed during the poll (403 S22)";
    if (res.status === 429 || res.status === 403) {
      throw new BoardFailure(
        "blocked",
        `board answered ${res.status}`,
        res.status,
      );
    }
    if (res.status !== 200) return `detail call answered ${res.status}`;
    let info: Record<string, unknown> | undefined;
    try {
      info = (
        JSON.parse(res.body) as {
          jobPostingInfo?: Record<string, unknown>;
        } | null
      )?.jobPostingInfo;
    } catch {
      return "detail body is not JSON";
    }
    if (!info || typeof info !== "object")
      return "detail has no jobPostingInfo";
    const extra: unknown[] = Array.isArray(info.additionalLocations)
      ? info.additionalLocations
      : [];
    const locations = [info.location, ...extra]
      .map(str)
      .filter((l): l is string => l !== null);
    if (locations.length === 0) return "location is missing";
    return {
      title: str(info.title),
      url: str(info.externalUrl),
      // startDate is a day with no time, and unlike the list's relative label it does not drift.
      postedAt: dateOrNull(info.startDate),
      locations,
      description: htmlToText(str(info.jobDescription) ?? ""),
    };
  }

  // Only Sightings the matcher would still join, so a repost after 30 quiet days gets fresh fields.
  private async storedSightings(keys: string[], now: Date) {
    const found = new Map<string, Fields>();
    if (keys.length === 0) return found;
    const rows = await this.prisma.sighting.findMany({
      where: {
        jobSource: "workday",
        listingKey: { in: keys },
        lastSeenAt: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY_MS) },
      },
      orderBy: { lastSeenAt: "desc" },
    });
    for (const s of rows)
      if (!found.has(s.listingKey)) found.set(s.listingKey, s);
    return found;
  }

  private draft(tenant: Tenant, key: string, f: Fields): SightingDraft {
    return {
      jobSource: "workday",
      listingKey: key,
      url: f.url,
      reportedAt: f.reportedAt,
      companyName: tenant.name,
      title: f.title,
      location: f.location,
      description: f.description,
      descriptionKind: f.descriptionKind as SightingDraft["descriptionKind"],
      watchedCompanyId: tenant.id,
    };
  }
}

function isGone(body: string): boolean {
  try {
    return (
      (JSON.parse(body) as { errorCode?: unknown } | null)?.errorCode === "S22"
    );
  } catch {
    return false;
  }
}

function causeOf(err: unknown): string {
  const cause = err instanceof Error ? (err.cause ?? err) : err;
  return cause instanceof Error ? cause.message : String(cause);
}

function readList(res: HttpResponse): ListPage {
  if (res.status === 422) {
    throw new BoardFailure(
      "fault",
      "board answered 422, which means a wrong wdN in the slug",
      422,
    );
  }
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
  let json: { total?: unknown; jobPostings?: unknown; facets?: unknown } | null;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new BoardFailure("fault", "body is not JSON");
  }
  if (!Array.isArray(json?.jobPostings) || typeof json?.total !== "number") {
    throw new BoardFailure("fault", "body has no jobPostings list or total");
  }
  return {
    total: json.total,
    postings: json.jobPostings,
    facets: json.facets,
  };
}

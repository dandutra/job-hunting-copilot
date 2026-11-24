import { Logger } from "@nestjs/common";
import { SightingDraft } from "../../matching/sighting-draft";
import { AlertHook } from "../alert-hook";
import {
  AdapterError,
  AdapterResult,
  JobSourceAdapter,
  PollWindow,
} from "../job-source-adapter";
import { getSearchTerms } from "../../jev/title-filter";
import { inSearchArea } from "../search-area";
import type { components } from "./schema";

type ScrapeRequest = components["schemas"]["ScrapeRequest"];
type ScrapeResponse = components["schemas"]["ScrapeResponse"];

// JobSpy matches a radius around its location, so Toronto's search never reaches London or Halifax. Each place gets its own adapter, so its cursor and its 429s stay apart. These are code, not variables, because the Search area is code too.
export const JOBSPY_PLACE_LOCATIONS = {
  london: "London, ON",
  halifax: "Halifax, NS",
} as const;
export type JobspyPlace = keyof typeof JOBSPY_PLACE_LOCATIONS;

export interface JobspyConfig {
  baseUrl: string;
  site: ScrapeRequest["site"];
  // From config/title-filter.json. One request carries all of them as an OR query, so a poll still makes one request.
  searchTerms: string[];
  location: string;
  // Absent for the Toronto adapter, which keeps the name `jobspy-<site>` so its cursor survives.
  place?: JobspyPlace;
  resultsWanted: number;
  // One request per poll, so this plus matching must stay inside Compose's 6-minute stop grace period.
  timeoutMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
// The ingest container gets 6 minutes to stop, and a poll in progress finishes first.
const TIMEOUT_MS = 5 * 60 * 1000;

// A blank variable means the default, because Compose passes unset ones through as "".
export function jobspyConfigFromEnv(
  site: JobspyConfig["site"],
  env: NodeJS.ProcessEnv = process.env,
  searchTerms: string[] = getSearchTerms(),
  place?: JobspyPlace,
): JobspyConfig {
  const resultsWanted = Number(env.JOBSPY_RESULTS_WANTED?.trim() || 50);
  if (!Number.isInteger(resultsWanted) || resultsWanted < 1) {
    throw new Error(
      `JOBSPY_RESULTS_WANTED must be a positive integer, not "${env.JOBSPY_RESULTS_WANTED}"`,
    );
  }
  return {
    baseUrl: env.JOBSPY_URL || "http://localhost:8000",
    site,
    searchTerms,
    location: place
      ? JOBSPY_PLACE_LOCATIONS[place]
      : env.JOBSPY_LOCATION?.trim() || "Toronto, ON",
    ...(place ? { place } : {}),
    resultsWanted,
    timeoutMs: TIMEOUT_MS,
  };
}

// JobSpy ids look like "li-123" and "in-abc"; the listing key is "<site>:<id without prefix>".
const ID_PREFIX = /^[a-z]+-/;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isScrapeResponse(body: unknown): body is ScrapeResponse {
  const b = body as ScrapeResponse | null;
  return (
    !!b && Array.isArray(b.rows) && !!b.errors && typeof b.errors === "object"
  );
}

export class JobspyAdapter extends JobSourceAdapter {
  readonly name: string;
  private readonly logger = new Logger(JobspyAdapter.name);

  constructor(
    private readonly config: JobspyConfig,
    private readonly alerts: AlertHook,
  ) {
    super();
    this.name = `jobspy-${config.site}${config.place ? `-${config.place}` : ""}`;
  }

  async poll(window: PollWindow): Promise<AdapterResult> {
    const response = await this.scrape(window);
    if (typeof response === "string") return this.fault(response);

    // A response at the cap may have had more rows behind it, and /scrape has no paging.
    if (response.rows.length === this.config.resultsWanted) {
      this.logger.warn(
        `${this.name}: ${response.rows.length} rows came back, the JOBSPY_RESULTS_WANTED cap, so rows past it were lost`,
      );
    }

    const errors: AdapterError[] = [];
    for (const [board, message] of Object.entries(response.errors)) {
      const detail = `${board}: ${message}`;
      errors.push({ kind: "blocked", message: detail });
      await this.alerts.alert({
        kind: "blocked",
        adapter: this.name,
        message: detail,
      });
    }

    const drafts: SightingDraft[] = [];
    let outside = 0;
    for (const row of response.rows) {
      if (!this.inArea(row)) {
        outside++;
        continue;
      }
      const draft = this.toDraft(row, window.now);
      if (typeof draft === "string") {
        errors.push({ kind: "bad-row", message: draft });
      } else {
        drafts.push(draft);
      }
    }
    if (outside > 0) {
      this.logger.log(
        `${this.name}: dropped ${outside} of ${response.rows.length} rows outside the Search area`,
      );
    }
    return { drafts, errors, completeBoards: [] };
  }

  // JobSpy often reports remote jobs as just "Canada" with is_remote set.
  private inArea(row: Record<string, unknown>): boolean {
    const location = text(row.location) ?? "";
    return inSearchArea([
      row.is_remote === true ? `Remote, ${location}` : location,
    ]);
  }

  // Returns the response, or a message describing why the scraper failed.
  private async scrape(window: PollWindow): Promise<ScrapeResponse | string> {
    const body: ScrapeRequest = {
      site: this.config.site,
      search_term: this.config.searchTerms.map((t) => `"${t}"`).join(" OR "),
      location: this.config.location,
      hours_old: Math.max(
        1,
        Math.ceil((window.now.getTime() - window.since.getTime()) / HOUR_MS),
      ),
      results_wanted: this.config.resultsWanted,
    };
    try {
      const res = await fetch(`${this.config.baseUrl}/scrape`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!res.ok) return `scraper answered ${res.status}`;
      const json: unknown = await res.json();
      return isScrapeResponse(json) ? json : "scraper sent an unexpected body";
    } catch (err) {
      // A DOMException from AbortSignal.timeout is not always an Error in this realm, so check the name only.
      if ((err as { name?: string } | null)?.name === "TimeoutError") {
        return `scraper timed out after ${this.config.timeoutMs} ms`;
      }
      const cause = err instanceof Error ? (err.cause ?? err) : err;
      return `scraper unreachable: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  private async fault(message: string): Promise<AdapterResult> {
    await this.alerts.alert({ kind: "fault", adapter: this.name, message });
    return {
      drafts: [],
      errors: [{ kind: "fault", message }],
      completeBoards: [],
    };
  }

  // Returns the draft, or a message naming the field that made the row unusable.
  private toDraft(
    row: Record<string, unknown>,
    now: Date,
  ): SightingDraft | string {
    const id = text(row.id);
    const url = text(row.job_url);
    const companyName = text(row.company);
    const title = text(row.title);
    for (const [field, value] of Object.entries({
      id,
      job_url: url,
      company: companyName,
      title,
    })) {
      if (!value) return `row skipped: ${field} is missing`;
    }

    const posted = text(row.date_posted);
    const reportedAt = posted ? new Date(`${posted}T00:00:00Z`) : now;
    const description = text(row.description);
    const directUrl = text(row.job_url_direct);
    return {
      // One source per board, whatever place found the row, because the source names are a closed list and a listing is one listing.
      jobSource: `jobspy-${this.config.site}`,
      listingKey: `${this.config.site}:${id!.replace(ID_PREFIX, "")}`,
      url: url!,
      reportedAt: Number.isNaN(reportedAt.getTime()) ? now : reportedAt,
      companyName: companyName!,
      title: title!,
      location: text(row.location) ?? "",
      description: description ?? "",
      descriptionKind: description ? "full" : "none",
      ...(directUrl ? { directUrl } : {}),
    };
  }
}

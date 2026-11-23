import { Logger } from "@nestjs/common";
import { SightingDraft } from "../../matching/sighting-draft";
import { AlertHook } from "../alert-hook";
import { HttpClient, USER_AGENT, fetchHttpClient, str } from "../board-adapter";
import {
  AdapterError,
  AdapterResult,
  JobSourceAdapter,
  PollWindow,
} from "../job-source-adapter";
import { inSearchArea } from "../search-area";

export interface AdzunaConfig {
  // Null when the variable is unset or blank. With either one missing the adapter polls nothing.
  appId: string | null;
  appKey: string | null;
  what: string;
}

export const RESULTS_PER_PAGE = 50;
// At 24 polls a day this is about 2,200 calls a month. Lower it if the account's monthly cap is smaller.
export const MAX_PAGES = 3;
const BASE_URL = "https://api.adzuna.com/v1/api/jobs/ca/search";
const DEFAULT_WHAT = "software developer";

// A blank variable means unset, because Compose passes an unset one through as "".
export function adzunaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AdzunaConfig {
  return {
    appId: env.ADZUNA_APP_ID?.trim() || null,
    appKey: env.ADZUNA_APP_KEY?.trim() || null,
    what: env.ADZUNA_WHAT?.trim() || DEFAULT_WHAT,
  };
}

// Adzuna's ids are strings in its spec, and a number is read the same way.
function idOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return str(value);
}

function isSearchBody(body: unknown): body is { results: unknown[] } {
  return Array.isArray((body as { results?: unknown } | null)?.results);
}

type Row = Record<string, unknown>;

// A page of rows, or the error that ended the read.
type Page = { rows: Row[] } | { error: AdapterError };

export class AdzunaAdapter extends JobSourceAdapter {
  readonly name = "adzuna";
  private readonly logger = new Logger(AdzunaAdapter.name);

  constructor(
    private readonly config: AdzunaConfig,
    private readonly alerts: AlertHook,
    private readonly http: HttpClient = fetchHttpClient,
  ) {
    super();
    // Not a fault, so the stack runs before the key exists.
    if (!this.hasKeys()) {
      this.logger.warn(
        "ADZUNA_APP_ID or ADZUNA_APP_KEY is not set, so Adzuna is not polled",
      );
    }
  }

  // Adzuna's call cap is small, so the window is ignored: max_days_old=2 on an hourly poll overlaps the last one, and a rerun is safe.
  async poll(window: PollWindow): Promise<AdapterResult> {
    const drafts: SightingDraft[] = [];
    const errors: AdapterError[] = [];
    if (!this.hasKeys()) return { drafts, errors, completeBoards: [] };

    let seen = 0;
    let outside = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (page > 1 && window.shouldStop()) break;
      const result = await this.fetchPage(page);
      if ("error" in result) {
        errors.push(result.error);
        await this.alerts.alert({
          kind: result.error.kind === "blocked" ? "blocked" : "fault",
          adapter: this.name,
          message: result.error.message,
        });
        break;
      }

      seen += result.rows.length;
      for (const row of result.rows) {
        const draft = this.toDraft(row, window.now);
        if (draft === "outside") {
          outside++;
        } else if (typeof draft === "string") {
          errors.push({ kind: "bad-row", message: draft });
        } else {
          drafts.push(draft);
        }
      }
      // A short page is the last one. It is counted before any row is dropped.
      if (result.rows.length < RESULTS_PER_PAGE) break;
    }

    if (outside > 0) {
      this.logger.log(
        `${this.name}: dropped ${outside} of ${seen} rows outside the Search area`,
      );
    }
    return { drafts, errors, completeBoards: [] };
  }

  private hasKeys(): boolean {
    return !!this.config.appId && !!this.config.appKey;
  }

  // No message here carries the URL, because it holds the app key.
  private async fetchPage(page: number): Promise<Page> {
    const query = new URLSearchParams({
      app_id: this.config.appId!,
      app_key: this.config.appKey!,
      what: this.config.what,
      where: "Toronto",
      max_days_old: "2",
      sort_by: "date",
      results_per_page: String(RESULTS_PER_PAGE),
    });
    let res;
    try {
      res = await this.http.get(`${BASE_URL}/${page}?${query}`, {
        accept: "application/json",
        "user-agent": USER_AGENT,
      });
    } catch (err) {
      const cause = err instanceof Error ? (err.cause ?? err) : err;
      const detail = cause instanceof Error ? cause.message : String(cause);
      return {
        error: { kind: "fault", message: `adzuna unreachable: ${detail}` },
      };
    }

    if (res.status === 401 || res.status === 429) {
      return {
        error: { kind: "blocked", message: `adzuna answered ${res.status}` },
      };
    }
    if (res.status !== 200) {
      return {
        error: { kind: "fault", message: `adzuna answered ${res.status}` },
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(res.body);
    } catch {
      body = null;
    }
    if (!isSearchBody(body)) {
      return {
        error: { kind: "fault", message: "adzuna sent an unexpected body" },
      };
    }
    return { rows: body.results as Row[] };
  }

  // Returns the draft, "outside" for a row outside the Search area, or a message naming the field that made the row unusable.
  private toDraft(row: Row, now: Date): SightingDraft | "outside" | string {
    const id = idOf(row?.id);
    const url = str(row?.redirect_url);
    const title = str(row?.title);
    const companyName = str((row?.company as Row | undefined)?.display_name);
    const location = row?.location as Row | undefined;
    const place = str(location?.display_name);
    const area = Array.isArray(location?.area)
      ? (location.area as unknown[]).filter(
          (a): a is string => typeof a === "string",
        )
      : [];
    for (const [field, value] of Object.entries({
      id,
      redirect_url: url,
      title,
      "company.display_name": companyName,
    })) {
      if (!value) return `row skipped: ${field} is missing`;
    }
    // A lost location field must not make every row look out of area.
    if (!place && area.length === 0) return "row skipped: location is missing";

    // The place name and the area path are judged separately, as one entry each.
    if (!inSearchArea([place ?? "", area.join(", ")])) return "outside";

    const created = str(row.created);
    const reportedAt = created ? new Date(created) : now;
    // The snippet is cut at 500 characters, so a Thin Posting follows.
    const description = str(row.description);
    return {
      jobSource: "adzuna",
      listingKey: `adzuna:${id}`,
      url: url!,
      reportedAt: Number.isNaN(reportedAt.getTime()) ? now : reportedAt,
      companyName: companyName!,
      title: title!,
      location: place ?? area.join(", "),
      description: description ?? "",
      descriptionKind: description ? "snippet" : "none",
    };
  }
}

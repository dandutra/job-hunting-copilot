import { SightingDraft } from "../matching/sighting-draft";

export interface PollWindow {
  // Oldest time the adapter must cover. It already includes the overlap with the last poll.
  since: Date;
  now: Date;
  // True once shutdown has begun; a long adapter checks it between requests and returns what it has.
  shouldStop(): boolean;
}

// "blocked": the source refused us. "fault": our scraper or the network broke. "bad-row": one row could not become a draft.
export type AdapterErrorKind = "blocked" | "fault" | "bad-row";

export interface AdapterError {
  kind: AdapterErrorKind;
  message: string;
  // Set by board adapters: the Company whose board raised it (a Watched company).
  watchedCompanyId?: number;
  // The HTTP status behind a board error, when there is one. A 404 board alerts once a day.
  httpStatus?: number;
}

// "incomplete" is a board cut off by shouldStop(): not an error, and not a full read of the board.
export interface BoardReport {
  watchedCompanyId: number;
  status: "ok" | "failed" | "incomplete";
  // Readable rows with a location, counted before the Search area filter, so an all-out-of-area board is not mistaken for an empty page.
  rows?: number;
}

export interface AdapterResult {
  drafts: SightingDraft[];
  errors: AdapterError[];
  // Board adapters list every board they tried; other adapters leave it out.
  boards?: BoardReport[];
  // Watched company ids whose board was listed in full: every row fetched, no error. Only these can close a Sighting.
  completeBoards: number[];
}

// Every Job source enters through this seam; matching only sees the drafts.
export abstract class JobSourceAdapter {
  abstract readonly name: string;
  // The scheduler ticks hourly and skips this adapter until this long after its last attempt.
  readonly minIntervalMs: number = 60 * 60 * 1000;
  abstract poll(window: PollWindow): Promise<AdapterResult>;
}

export const JOB_SOURCE_ADAPTERS = Symbol("JOB_SOURCE_ADAPTERS");

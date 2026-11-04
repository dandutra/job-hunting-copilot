import { SightingDraft } from "../matching/sighting-draft";

export interface PollWindow {
  // Oldest time the adapter must cover. It already includes the overlap with the last poll.
  since: Date;
  now: Date;
}

// "blocked": the source refused us. "fault": our scraper or the network broke. "bad-row": one row could not become a draft.
export type AdapterErrorKind = "blocked" | "fault" | "bad-row";

export interface AdapterError {
  kind: AdapterErrorKind;
  message: string;
}

export interface AdapterResult {
  drafts: SightingDraft[];
  errors: AdapterError[];
}

// Every Job source enters through this seam; matching only sees the drafts.
export abstract class JobSourceAdapter {
  abstract readonly name: string;
  abstract poll(window: PollWindow): Promise<AdapterResult>;
}

export const JOB_SOURCE_ADAPTERS = Symbol("JOB_SOURCE_ADAPTERS");

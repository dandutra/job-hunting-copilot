const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 30;

export type PostingState = "open" | "closed" | "stale";

export interface StateSighting {
  watchedCompanyId: number | null;
  lastSeenAt: Date;
  closedAt: Date | null;
}

// Derived on every read and never stored; see the "Only boards close a Posting" decision.
export function postingState(
  sightings: StateSighting[],
  now: Date = new Date(),
): PostingState {
  if (sightings.length === 0) return "open";
  const boards = sightings.filter((s) => s.watchedCompanyId !== null);
  const newestSeen = Math.max(...sightings.map((s) => s.lastSeenAt.getTime()));

  if (boards.length === 0) {
    return now.getTime() - newestSeen > STALE_AFTER_DAYS * DAY_MS
      ? "stale"
      : "open";
  }
  const closes = boards.flatMap((s) =>
    s.closedAt ? [s.closedAt.getTime()] : [],
  );
  if (closes.length < boards.length) return "open";
  return newestSeen > Math.max(...closes) ? "open" : "closed";
}

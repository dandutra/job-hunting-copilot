export type Phase = "tuning" | "test" | "spot_check";

export interface PhaseWindow {
  phase: Phase;
  // Inclusive start and exclusive end; null is open-ended.
  from: Date;
  to: Date | null;
}

// Dates are Toronto midnights in winter (UTC-5). They are not personal, so they live in code: the API image has no config/ folder.
export const LABEL_SCHEDULE = {
  // A Posting first seen before this is not drawn.
  firstSeenFrom: new Date("2026-11-15T00:00:00-05:00"),
  windows: [
    {
      phase: "tuning",
      from: new Date("2026-11-29T00:00:00-05:00"),
      to: new Date("2026-12-13T00:00:00-05:00"),
    },
    {
      phase: "test",
      from: new Date("2026-12-13T00:00:00-05:00"),
      to: new Date("2026-12-20T00:00:00-05:00"),
    },
    // The fresh test if the first one fails.
    {
      phase: "test",
      from: new Date("2026-12-23T00:00:00-05:00"),
      to: new Date("2026-12-30T00:00:00-05:00"),
    },
    {
      phase: "spot_check",
      from: new Date("2027-01-01T00:00:00-05:00"),
      to: null,
    },
  ] satisfies PhaseWindow[],
};

export interface ActiveWindow extends PhaseWindow {
  // Where this window's counts begin: the window start, or the month start for the spot check.
  start: Date;
}

export function activeWindow(
  now: Date,
  windows: PhaseWindow[] = LABEL_SCHEDULE.windows,
): ActiveWindow | null {
  const w = windows.find((x) => now >= x.from && (!x.to || now < x.to));
  if (!w) return null;
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const start =
    w.phase === "spot_check" && monthStart > w.from ? monthStart : w.from;
  return { ...w, start };
}

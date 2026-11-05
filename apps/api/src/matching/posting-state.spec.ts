import { postingState, StateSighting } from "./posting-state";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

function board(over: Partial<StateSighting> = {}): StateSighting {
  return {
    watchedCompanyId: 1,
    lastSeenAt: daysAgo(5),
    closedAt: daysAgo(4),
    ...over,
  };
}
function aggregator(over: Partial<StateSighting> = {}): StateSighting {
  return {
    watchedCompanyId: null,
    lastSeenAt: daysAgo(1),
    closedAt: null,
    ...over,
  };
}

describe("postingState", () => {
  it("is closed when every board Sighting is closed and nothing was seen after", () => {
    expect(postingState([board(), board({ closedAt: daysAgo(3) })], NOW)).toBe(
      "closed",
    );
  });

  it("is open when a LinkedIn Sighting was seen after the close", () => {
    const linkedin = aggregator({ lastSeenAt: daysAgo(2) });
    expect(postingState([board(), linkedin], NOW)).toBe("open");
  });

  it("stays closed when the aggregator Sighting was seen before the close", () => {
    const linkedin = aggregator({ lastSeenAt: daysAgo(6) });
    expect(postingState([board(), linkedin], NOW)).toBe("closed");
  });

  it("is open when a second board still lists it", () => {
    const other = board({ watchedCompanyId: 2, closedAt: null });
    expect(postingState([board(), other], NOW)).toBe("open");
  });

  it("is stale only after 30 days with no board Sighting", () => {
    expect(postingState([aggregator({ lastSeenAt: daysAgo(31) })], NOW)).toBe(
      "stale",
    );
    expect(postingState([aggregator({ lastSeenAt: daysAgo(30) })], NOW)).toBe(
      "open",
    );
    expect(postingState([aggregator({ lastSeenAt: daysAgo(10) })], NOW)).toBe(
      "open",
    );
  });

  it("judges stale by the newest Sighting", () => {
    const sightings = [
      aggregator({ lastSeenAt: daysAgo(60) }),
      aggregator({ lastSeenAt: daysAgo(3) }),
    ];
    expect(postingState(sightings, NOW)).toBe("open");
  });

  it("goes stale when an open board Sighting is quiet for 30 days", () => {
    const quiet = (d: number) =>
      board({ closedAt: null, lastSeenAt: daysAgo(d) });
    expect(postingState([quiet(31)], NOW)).toBe("stale");
    expect(postingState([quiet(30)], NOW)).toBe("open");
  });

  it("stays open when an aggregator still reports a Posting whose board went quiet", () => {
    const quiet = board({ closedAt: null, lastSeenAt: daysAgo(40) });
    expect(postingState([quiet, aggregator()], NOW)).toBe("open");
  });

  it("is closed when one board closed it and another board went quiet", () => {
    const quiet = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(40),
    });
    expect(postingState([board(), quiet], NOW)).toBe("closed");
  });

  it("stays closed long after the close", () => {
    const old = board({ lastSeenAt: daysAgo(90), closedAt: daysAgo(89) });
    expect(postingState([old], NOW)).toBe("closed");
  });

  it("is open with no Sightings", () => {
    expect(postingState([], NOW)).toBe("open");
  });
});

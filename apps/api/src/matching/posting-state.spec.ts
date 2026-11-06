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
  it("is closed when its boards closed it and nothing was seen after the latest close", () => {
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

  it("is closed when one board closed it and the other board went quiet before the close", () => {
    const quiet = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(40),
    });
    expect(postingState([board(), quiet], NOW)).toBe("closed");
  });

  it("goes stale when a board Sighting seen after an old close goes quiet", () => {
    const closedLongAgo = board({
      lastSeenAt: daysAgo(61),
      closedAt: daysAgo(60),
    });
    const quiet = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(40),
    });
    expect(postingState([closedLongAgo, quiet], NOW)).toBe("stale");
  });

  it("goes stale when an aggregator report after an old close goes quiet", () => {
    const closedLongAgo = board({
      lastSeenAt: daysAgo(61),
      closedAt: daysAgo(60),
    });
    const linkedin = aggregator({ lastSeenAt: daysAgo(50) });
    expect(postingState([closedLongAgo, linkedin], NOW)).toBe("stale");
  });

  it("goes stale when a quiet board and an aggregator are both over 30 days old", () => {
    const quiet = board({ closedAt: null, lastSeenAt: daysAgo(40) });
    const linkedin = aggregator({ lastSeenAt: daysAgo(35) });
    expect(postingState([quiet, linkedin], NOW)).toBe("stale");
  });

  it("is open when a board seen 29 days ago still lists it next to an old close", () => {
    const closedLongAgo = board({
      lastSeenAt: daysAgo(61),
      closedAt: daysAgo(60),
    });
    const listed = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(29),
    });
    expect(postingState([closedLongAgo, listed], NOW)).toBe("open");
  });

  it("is open when a board still lists it after another board's newer close", () => {
    const justClosed = board({ lastSeenAt: daysAgo(2), closedAt: daysAgo(1) });
    const listed = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(3),
    });
    expect(postingState([justClosed, listed], NOW)).toBe("open");
  });

  it("counts a report at the instant of the close as before it", () => {
    const linkedin = aggregator({ lastSeenAt: daysAgo(4) });
    expect(postingState([board(), linkedin], NOW)).toBe("closed");
  });

  it("turns closed with no new report once the board holding it open goes quiet", () => {
    const closed = board({ lastSeenAt: daysAgo(6), closedAt: daysAgo(5) });
    const unread = board({
      watchedCompanyId: 2,
      closedAt: null,
      lastSeenAt: daysAgo(10),
    });
    const later = new Date(NOW.getTime() + 21 * DAY);
    expect(postingState([closed, unread], NOW)).toBe("open");
    expect(postingState([closed, unread], later)).toBe("closed");
  });

  it("stays closed long after the close", () => {
    const old = board({ lastSeenAt: daysAgo(90), closedAt: daysAgo(89) });
    expect(postingState([old], NOW)).toBe("closed");
  });

  it("is open with no Sightings", () => {
    expect(postingState([], NOW)).toBe("open");
  });
});

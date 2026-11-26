import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { ApiProvider } from "../api/ApiContext";
import type { ApiClient } from "../api/client";
import type { components } from "../api/schema";

afterEach(cleanup);

type Item = components["schemas"]["FeedItemDto"];
type Detail = components["schemas"]["PostingDetailDto"];

const item = (
  id: number,
  tier: Item["tier"],
  over: Partial<Item> = {},
): Item => ({
  id,
  tier,
  title: `Title ${id}`,
  company: `Company ${id}`,
  location: "Toronto, ON",
  metros: ["gta"],
  entryLevel: false,
  postedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  sightingCount: 1,
  thin: false,
  capsApplied: [],
  hasLookalike: false,
  feedCorrection: null,
  state: "open",
  ...over,
});

const detail = (it: Item, over: Partial<Detail> = {}): Detail => ({
  ...it,
  workArrangement: "hybrid",
  roleFamily: "back_end",
  why: {
    total: 1.2,
    thresholds: { a: 0.9, b: 0.6 },
    factors: [
      { factor: "skills_covered", answer: "3 of 3", points: 0.6 },
      { factor: "level_match", answer: "3 of 3", points: 0.4 },
      { factor: "role_family", answer: "back_end", points: 0.1 },
      { factor: "work_arrangement", answer: "hybrid", points: 0.1 },
    ],
    stale: false,
  },
  descriptionKind: "full",
  description: `Body of ${it.title}`,
  links: [{ url: `https://example.com/${it.id}`, jobSources: ["greenhouse"] }],
  tailoredResumeId: null,
  lookalikes: [],
  ...over,
});

const ITEMS = [
  item(1, "A"),
  item(2, "A"),
  item(3, "B"),
  item(4, "C", { title: "Skipped one", capsApplied: ["us_only"] }),
];

interface Init {
  params?: { path?: { id: number }; query?: { include?: string } };
  body?: unknown;
}

interface Stub {
  client: ApiClient;
  calls: { method: string; path: string; init?: unknown }[];
}

function stub(
  opts: {
    items?: (include?: string) => Item[];
    details?: Record<number, Detail>;
  } = {},
): Stub {
  const calls: Stub["calls"] = [];
  const items = opts.items ?? (() => ITEMS);
  const call = async (method: string, path: string, init?: Init) => {
    calls.push({ method, path, init });
    if (method === "GET" && path === "/postings")
      return { data: items(init?.params?.query?.include) };
    if (method === "GET" && path === "/postings/{id}") {
      const id = init!.params!.path!.id;
      const found =
        opts.details?.[id] ??
        (() => {
          const it = items("closed").find((x) => x.id === id);
          return it && detail(it);
        })();
      return found ? { data: found } : { error: {}, response: { status: 404 } };
    }
    if (path === "/lookalikes/{id}/merge") return { data: { postingId: 1 } };
    return { data: {}, response: { status: 201 } };
  };
  const client = {
    GET: vi.fn((p: string, i?: Init) => call("GET", p, i)),
    POST: vi.fn((p: string, i?: Init) => call("POST", p, i)),
  } as unknown as ApiClient;
  return { client, calls };
}

function renderAt(path: string, s: Stub) {
  return render(
    <ApiProvider client={s.client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

const rowOf = (title: string) =>
  screen
    .getAllByText(title)
    .map((el) => el.closest("a"))
    .find((a) => a !== null)!;

it("lists A and B under their headers and starts with C collapsed", async () => {
  renderAt("/", stub());

  await screen.findByText("Title 1");
  expect(screen.getByText("Title 3")).toBeTruthy();
  expect(screen.queryByText("Skipped one")).toBeNull();
  const header = screen.getByRole("button", { name: /Tier C/ });
  expect(header.getAttribute("aria-expanded")).toBe("false");
  expect(header.className).toContain("tier-tint-C");

  fireEvent.click(header);

  expect(screen.getByText("Skipped one")).toBeTruthy();
});

it("collapses a Tier group on its header", async () => {
  renderAt("/", stub());
  await screen.findByText("Title 1");

  fireEvent.click(screen.getByRole("button", { name: /Tier A/ }));

  expect(screen.queryByText("Title 1")).toBeNull();
});

it("moves the selection with j and k, opening each Posting's URL", async () => {
  const s = stub();
  renderAt("/postings/1", s);
  await screen.findByRole("heading", { name: "Title 1" });
  // The list loads apart from the detail, and j does nothing until it has rows.
  await screen.findByText("Title 2");

  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Title 2" });
  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Title 3" });
  expect(rowOf("Title 3").getAttribute("aria-current")).toBe("true");
  expect(rowOf("Title 3").getAttribute("href")).toBe("/postings/3");
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "Title 2" });

  // C is collapsed, so j from the last visible Posting stays put.
  fireEvent.keyDown(window, { key: "j" });
  fireEvent.keyDown(window, { key: "j" });
  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Title 3" });
});

it("opens the first Posting when the feed has no id in the URL", async () => {
  renderAt("/", stub());

  await screen.findByRole("heading", { name: "Title 1" });
});

it("opens a Posting from its deep link, even one the list leaves out", async () => {
  const s = stub();
  renderAt("/postings/4", s);

  await screen.findByRole("heading", { name: "Skipped one" });
});

it("shows what the Posting detail needs", async () => {
  renderAt(
    "/postings/1",
    stub({
      details: {
        1: detail(
          item(1, "C", {
            capsApplied: ["us_only", "outside_gta"],
            thin: true,
            state: "stale",
          }),
          {
            description: "",
            descriptionKind: "none",
            links: [
              {
                url: "https://example.com/x",
                jobSources: ["greenhouse", "adzuna"],
              },
            ],
          },
        ),
      },
    }),
  );

  await screen.findByRole("heading", { name: "Title 1" });
  expect(
    within(screen.getByRole("article")).getByText(/Company 1/).textContent,
  ).toContain("hybrid");
  expect(screen.getByText("Stale")).toBeTruthy();
  expect(screen.getByText("Thin").className).toContain("flag");
  expect(screen.getByText(/US only/).textContent).toContain(
    "Work outside the Search area",
  );
  expect(screen.getByText(/No description yet/).textContent).toContain("link");
  const link = screen.getByRole("link", { name: "greenhouse" });
  expect(link.getAttribute("href")).toBe("https://example.com/x");
  expect(screen.getByText(/adzuna/)).toBeTruthy();
  expect(screen.getByText(/Skills covered/)).toBeTruthy();
});

it("copies /tailor <Posting ID> to the clipboard", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  renderAt("/postings/2", stub());
  await screen.findByRole("heading", { name: "Title 2" });

  fireEvent.click(screen.getByRole("button", { name: "Copy /tailor 2" }));

  expect(writeText).toHaveBeenCalledWith("/tailor 2");
});

it("offers the two other Tiers, posts a Feed correction and sends no Label", async () => {
  const s = stub();
  renderAt("/postings/3", s);
  await screen.findByRole("heading", { name: "Title 3" });
  const control = within(
    screen.getByRole("group", { name: "Feed correction" }),
  );
  expect(control.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "A",
    "C",
  ]);

  fireEvent.click(control.getByRole("button", { name: "A" }));

  await waitFor(() =>
    expect(s.calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/postings/{id}/feed-correction",
      init: { params: { path: { id: 3 } }, body: { tier: "A" } },
    }),
  );
  await screen.findAllByText("you said A");
  expect(s.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  expect(s.calls.some((c) => c.path.includes("label"))).toBe(false);
});

it("toggles the correction off on a second click without another call", async () => {
  const s = stub();
  renderAt("/postings/3", s);
  await screen.findByRole("heading", { name: "Title 3" });
  const control = within(
    screen.getByRole("group", { name: "Feed correction" }),
  );
  fireEvent.click(control.getByRole("button", { name: "A" }));
  await screen.findAllByText("you said A");

  fireEvent.click(control.getByRole("button", { name: "A" }));

  await waitFor(() => expect(screen.queryByText("you said A")).toBeNull());
  expect(s.calls.filter((c) => c.method === "POST")).toHaveLength(1);
});

it("shows 'you said X' for a stored Feed correction in the list", async () => {
  renderAt("/", stub({ items: () => [item(1, "A", { feedCorrection: "C" })] }));

  expect(await screen.findByText("you said C")).toBeTruthy();
});

it("flags Thin, Capped, Lookalike and the Sighting count on a row", async () => {
  renderAt(
    "/",
    stub({
      items: () => [
        item(1, "A", { thin: true, hasLookalike: true, sightingCount: 3 }),
        item(4, "C", { capsApplied: ["us_only"] }),
      ],
    }),
  );
  await screen.findByText("Title 1");

  const row = within(rowOf("Title 1"));
  expect(row.getByText("Thin")).toBeTruthy();
  expect(row.getByText("Lookalike")).toBeTruthy();
  expect(row.getByText("3 Sightings")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Tier C/ }));
  expect(within(rowOf("Title 4")).getByText("Capped")).toBeTruthy();
});

const LOOKALIKE = {
  id: 9,
  reason: "similar_title",
  other: {
    id: 2,
    title: "Twin role",
    company: "Twin Co",
    location: "Toronto, ON",
    tier: "B" as const,
  },
};

it("removes the Lookalike hint when the user says 'Not the same'", async () => {
  const s = stub({
    details: {
      1: detail(item(1, "A", { hasLookalike: true }), {
        lookalikes: [LOOKALIKE],
      }),
    },
  });
  renderAt("/postings/1", s);
  const hint = await screen.findByText(/Twin role/);
  expect(hint.closest(".lookalike")!.textContent).toContain("Twin Co");

  fireEvent.click(screen.getByRole("button", { name: "Not the same" }));

  await waitFor(() => expect(screen.queryByText(/Twin role/)).toBeNull());
  expect(s.calls.find((c) => c.method === "POST")).toMatchObject({
    path: "/lookalikes/{id}/dismiss",
    init: { params: { path: { id: 9 } } },
  });
});

it("merges a Lookalike and opens the surviving Posting", async () => {
  const s = stub({
    details: {
      2: detail(item(2, "A", { hasLookalike: true }), {
        lookalikes: [{ ...LOOKALIKE, other: { ...LOOKALIKE.other, id: 1 } }],
      }),
    },
  });
  renderAt("/postings/2", s);
  await screen.findByText(/Twin role/);

  fireEvent.click(screen.getByRole("button", { name: "Merge" }));

  await screen.findByRole("heading", { name: "Title 1" });
  expect(s.calls.find((c) => c.path === "/lookalikes/{id}/merge")).toBeTruthy();
});

it("lists Closed and Stale Postings only behind the toggle", async () => {
  const closed = item(7, "A", { title: "Gone", state: "closed" });
  const s = stub({
    items: (include) => (include === "closed" ? [...ITEMS, closed] : ITEMS),
  });
  renderAt("/", s);
  await screen.findByText("Title 1");
  expect(s.calls[0].init).not.toMatchObject({
    params: { query: { include: "closed" } },
  });
  expect(screen.queryByText("Gone")).toBeNull();

  fireEvent.click(screen.getByRole("checkbox", { name: "Closed and stale" }));

  const gone = await screen.findByText("Gone");
  expect(within(gone.closest("a")!).getByText("Closed")).toBeTruthy();
  expect(
    s.calls.some(
      (c) =>
        (c.init as { params?: { query?: { include?: string } } })?.params?.query
          ?.include === "closed",
    ),
  ).toBe(true);
});

it("says so when the feed is empty", async () => {
  renderAt("/", stub({ items: () => [] }));

  expect(await screen.findByText(/No Postings/)).toBeTruthy();
});

it("warns when the points come from a newer tier config than the Tier", async () => {
  const it3 = item(3, "B");
  const d = detail(it3);
  renderAt(
    "/postings/3",
    stub({ details: { 3: { ...d, why: { ...d.why!, stale: true } } } }),
  );

  expect(await screen.findByText(/tier:recompute/)).toBeTruthy();
});

it("keeps j working after the Closed and stale checkbox takes focus", async () => {
  renderAt("/postings/1", stub());
  await screen.findByRole("heading", { name: "Title 1" });
  // The list loads apart from the detail, and j does nothing until it has rows.
  await screen.findByText("Title 2");
  const box = screen.getByRole("checkbox", { name: "Closed and stale" });
  box.focus();

  fireEvent.keyDown(box, { key: "j" });

  await screen.findByRole("heading", { name: "Title 2" });
});

const daysAgo = (d: number) =>
  new Date(Date.now() - d * 86400000).toISOString();

it("keeps only Postings from the last 3 days behind the toggle", async () => {
  renderAt(
    "/",
    stub({
      items: () => [
        item(1, "A", { title: "Fresh one", postedAt: daysAgo(1) }),
        item(2, "A", { title: "Old one", postedAt: daysAgo(5) }),
      ],
    }),
  );
  await screen.findByText("Old one");

  fireEvent.click(screen.getByLabelText("Last 3 days"));

  expect(rowOf("Fresh one")).toBeTruthy();
  expect(screen.queryByText("Old one")).toBeNull();
  expect(
    within(screen.getByRole("button", { name: /Tier A/ })).getByText("(1)"),
  ).toBeTruthy();
});

it("skips a filtered-out Posting with j", async () => {
  renderAt(
    "/postings/1",
    stub({
      items: () => [
        item(1, "A", { postedAt: daysAgo(1) }),
        item(2, "A", { postedAt: daysAgo(5) }),
        item(3, "B", { postedAt: daysAgo(2) }),
      ],
    }),
  );
  await screen.findByRole("heading", { name: "Title 1" });
  // The list loads apart from the detail, and j does nothing until it has rows.
  await screen.findByText("Title 3");
  fireEvent.click(screen.getByLabelText("Last 3 days"));

  fireEvent.keyDown(window, { key: "j" });

  await screen.findByRole("heading", { name: "Title 3" });
});

it("says so when nothing was posted in the last 3 days", async () => {
  renderAt(
    "/",
    stub({ items: () => [item(1, "A", { postedAt: daysAgo(5) })] }),
  );
  await screen.findByText("Title 1");

  fireEvent.click(screen.getByLabelText("Last 3 days"));

  expect(screen.getByText("No Postings in the last 3 days.")).toBeTruthy();
});

const PLACES = [
  item(1, "A", { title: "Toronto job", metros: ["gta"] }),
  item(2, "A", {
    title: "London job",
    location: "London, ON",
    metros: ["london-on"],
  }),
  item(3, "B", {
    title: "Halifax job",
    location: "Halifax, NS",
    metros: ["halifax"],
  }),
  item(4, "B", {
    title: "Remote job",
    location: "Remote, Canada",
    metros: ["remote-canada"],
  }),
  item(5, "B", {
    title: "Two places job",
    location: "Toronto; London, ON",
    metros: ["gta", "london-on"],
  }),
];

const pickLocation = (value: string) =>
  fireEvent.change(screen.getByLabelText("Location"), { target: { value } });

// The selected Posting's title also sits in the detail pane, so read the list rows alone.
const listed = () =>
  Array.from(document.querySelectorAll(".feed-item b")).map(
    (b) => b.textContent,
  );

it("offers every place, starting at All locations", async () => {
  renderAt("/", stub({ items: () => PLACES }));
  await screen.findByText("Halifax job");

  const select = screen.getByLabelText("Location") as HTMLSelectElement;

  expect(select.value).toBe("all");
  expect(
    within(select)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual([
    "All locations",
    "Toronto and the GTA",
    "London, Ontario",
    "Halifax, Nova Scotia",
    "Remote in Canada",
  ]);
  expect(listed()).toHaveLength(PLACES.length);
});

it("hides the Postings of other places, and shows one that names two places under both", async () => {
  renderAt("/", stub({ items: () => PLACES }));
  await screen.findByText("Halifax job");

  pickLocation("london-on");

  expect(listed()).toEqual(["London job", "Two places job"]);

  pickLocation("gta");

  expect(listed()).toEqual(["Toronto job", "Two places job"]);

  pickLocation("all");

  expect(listed()).toHaveLength(PLACES.length);
});

it("passes a Posting only when it clears the location, the 3-day and the closed filters", async () => {
  const items = (include?: string) => {
    const rows = [
      item(1, "A", {
        title: "Fresh London",
        metros: ["london-on"],
        postedAt: daysAgo(1),
      }),
      item(2, "A", {
        title: "Old London",
        metros: ["london-on"],
        postedAt: daysAgo(5),
      }),
      item(3, "A", { title: "Fresh Toronto", postedAt: daysAgo(1) }),
    ];
    return include === "closed"
      ? [
          ...rows,
          item(4, "A", {
            title: "Closed London",
            metros: ["london-on"],
            state: "closed",
            postedAt: daysAgo(1),
          }),
        ]
      : rows;
  };
  renderAt("/", stub({ items }));
  await screen.findByText("Old London");

  pickLocation("london-on");
  fireEvent.click(screen.getByLabelText("Last 3 days"));

  expect(listed()).toEqual(["Fresh London"]);

  fireEvent.click(screen.getByLabelText("Closed and stale"));

  await waitFor(() => expect(listed()).toContain("Closed London"));
  expect(listed()).toEqual(["Fresh London", "Closed London"]);
});

it("says so when a location has no Postings, and brings the rows back with All locations", async () => {
  renderAt("/", stub({ items: () => PLACES.slice(0, 1) }));
  await screen.findByText("Toronto job");

  pickLocation("halifax");

  expect(screen.getByText("No Postings in this location.")).toBeTruthy();
  expect(listed()).toEqual([]);

  pickLocation("all");

  expect(screen.queryByText("No Postings in this location.")).toBeNull();
  expect(listed()).toEqual(["Toronto job"]);
});

it("keeps j and k inside the filtered list", async () => {
  renderAt(
    "/postings/2",
    stub({
      items: () => [
        PLACES[0],
        PLACES[1],
        PLACES[2],
        PLACES[4],
        item(6, "B", {
          title: "Late London",
          metros: ["london-on"],
        }),
      ],
    }),
  );
  await screen.findByRole("heading", { name: "London job" });
  await screen.findByText("Late London");
  pickLocation("london-on");

  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Two places job" });
  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Late London" });
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "Two places job" });
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "London job" });
  // The Toronto Posting above is filtered out, so k stops here.
  fireEvent.keyDown(window, { key: "k" });
  fireEvent.keyDown(window, { key: "k" });
  expect(screen.getByRole("heading", { name: "London job" })).toBeTruthy();
});

it("still opens a Posting chosen by URL when the location filter hides it", async () => {
  renderAt("/postings/1", stub({ items: () => PLACES }));
  await screen.findByRole("heading", { name: "Toronto job" });
  await screen.findByText("London job");

  pickLocation("london-on");

  expect(listed()).not.toContain("Toronto job");
  expect(screen.getByRole("heading", { name: "Toronto job" })).toBeTruthy();
});

const tickEntryLevel = () =>
  fireEvent.click(screen.getByLabelText("Entry level"));

const ENTRY = [
  item(1, "A", {
    title: "Fresh junior London",
    entryLevel: true,
    metros: ["london-on"],
    postedAt: daysAgo(1),
  }),
  item(2, "A", {
    title: "Old junior London",
    entryLevel: true,
    metros: ["london-on"],
    postedAt: daysAgo(5),
  }),
  item(3, "A", {
    title: "Fresh junior Toronto",
    entryLevel: true,
    postedAt: daysAgo(1),
  }),
  item(4, "B", {
    title: "Fresh plain London",
    metros: ["london-on"],
    postedAt: daysAgo(1),
  }),
  item(5, "B", { title: "Fresh plain Toronto", postedAt: daysAgo(1) }),
];

it("shows only entry-level Postings with the box ticked, and everything again when it is cleared", async () => {
  renderAt("/", stub({ items: () => ENTRY }));
  await screen.findByText("Fresh plain Toronto");

  tickEntryLevel();

  expect(listed()).toEqual([
    "Fresh junior London",
    "Old junior London",
    "Fresh junior Toronto",
  ]);

  tickEntryLevel();

  expect(listed()).toHaveLength(ENTRY.length);
});

it("stacks Entry level with Location, and clearing one leaves the other's state", async () => {
  renderAt("/", stub({ items: () => ENTRY }));
  await screen.findByText("Fresh plain Toronto");

  tickEntryLevel();
  pickLocation("london-on");

  expect(listed()).toEqual(["Fresh junior London", "Old junior London"]);

  tickEntryLevel();

  expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe(
    "london-on",
  );
  expect(listed()).toEqual([
    "Fresh junior London",
    "Old junior London",
    "Fresh plain London",
  ]);
});

it("stacks Entry level with Last 3 days, and clearing one leaves the other's state", async () => {
  renderAt("/", stub({ items: () => ENTRY }));
  await screen.findByText("Fresh plain Toronto");

  tickEntryLevel();
  fireEvent.click(screen.getByLabelText("Last 3 days"));

  expect(listed()).toEqual(["Fresh junior London", "Fresh junior Toronto"]);

  tickEntryLevel();

  expect(
    (screen.getByLabelText("Last 3 days") as HTMLInputElement).checked,
  ).toBe(true);
  expect(listed()).not.toContain("Old junior London");
  expect(listed()).toContain("Fresh plain Toronto");
});

it("says 'No entry-level Postings.' when the box empties a list that Location left", async () => {
  renderAt("/", stub({ items: () => ENTRY.slice(3) }));
  await screen.findByText("Fresh plain Toronto");

  tickEntryLevel();

  expect(screen.getByText("No entry-level Postings.")).toBeTruthy();
  expect(screen.queryByText(/No Postings in/)).toBeNull();
});

it("names the location in that message once one is chosen, and blames the location when it empties the list first", async () => {
  renderAt("/", stub({ items: () => [...ENTRY.slice(0, 1), ENTRY[4]] }));
  await screen.findByText("Fresh plain Toronto");
  tickEntryLevel();
  pickLocation("gta");

  expect(
    screen.getByText("No entry-level Postings in this location."),
  ).toBeTruthy();

  pickLocation("halifax");

  expect(screen.getByText("No Postings in this location.")).toBeTruthy();
  expect(screen.queryByText(/No entry-level Postings/)).toBeNull();
});

it("says 'No Postings in the last 3 days.' when only the cutoff empties a list that Entry level left", async () => {
  renderAt("/", stub({ items: () => ENTRY.slice(1, 2) }));
  await screen.findByText("Old junior London");
  tickEntryLevel();
  fireEvent.click(screen.getByLabelText("Last 3 days"));

  expect(screen.getByText("No Postings in the last 3 days.")).toBeTruthy();
  expect(screen.queryByText(/No entry-level/)).toBeNull();
});

it("keeps j and k inside the entry-level list", async () => {
  renderAt("/postings/1", stub({ items: () => ENTRY }));
  await screen.findByRole("heading", { name: "Fresh junior London" });
  await screen.findByText("Fresh plain Toronto");
  tickEntryLevel();

  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Old junior London" });
  fireEvent.keyDown(window, { key: "j" });
  await screen.findByRole("heading", { name: "Fresh junior Toronto" });
  // The plain Postings below are filtered out, so j stops here.
  fireEvent.keyDown(window, { key: "j" });
  fireEvent.keyDown(window, { key: "j" });
  expect(
    screen.getByRole("heading", { name: "Fresh junior Toronto" }),
  ).toBeTruthy();
});

it("keeps Tier C collapsed with Entry level ticked", async () => {
  renderAt(
    "/",
    stub({
      items: () => [
        item(1, "C", { title: "Junior C", entryLevel: true }),
        item(2, "A", { title: "Junior A", entryLevel: true }),
      ],
    }),
  );
  await screen.findByText("Junior A");

  tickEntryLevel();

  expect(listed()).toEqual(["Junior A"]);
  expect(
    screen
      .getByRole("button", { name: /Tier C/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("links a Posting's newest draft as Review draft, and shows no link when it has none", async () => {
  const withDraft = item(1, "A");
  const without = item(2, "A");
  renderAt(
    "/postings/1",
    stub({
      items: () => [withDraft, without],
      details: {
        1: detail(withDraft, { tailoredResumeId: 9 }),
        2: detail(without),
      },
    }),
  );
  await screen.findByRole("heading", { name: "Title 1" });

  const link = screen.getByRole("link", { name: "Review draft" });
  expect(link.getAttribute("href")).toBe("/resumes/9");

  // The list loads apart from the detail.
  await screen.findByText("Title 2");
  fireEvent.click(rowOf("Title 2"));
  await screen.findByRole("heading", { name: "Title 2" });
  expect(screen.queryByRole("link", { name: "Review draft" })).toBeNull();
});

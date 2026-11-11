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
  },
  descriptionKind: "full",
  description: `Body of ${it.title}`,
  links: [{ url: `https://example.com/${it.id}`, jobSources: ["greenhouse"] }],
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
    "Work outside the GTA",
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

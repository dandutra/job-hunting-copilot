import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiProvider } from "./api/ApiContext";
import type { ApiClient } from "./api/client";
import { TierBadge } from "./TierBadge";

afterEach(cleanup);

const emptyClient = {
  GET: vi.fn(async (path: string) =>
    path === "/postings" ? { data: [] } : { error: {} },
  ),
} as unknown as ApiClient;

function renderAt(path: string) {
  return render(
    <ApiProvider client={emptyClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

it.each([
  ["/merges", "Merge log"],
  ["/resumes/7", "Tailored resume review"],
])("renders a placeholder at %s", (path, heading) => {
  renderAt(path);

  expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
});

it("links the feed, the Label queue and the merge log in the top bar", () => {
  renderAt("/postings/42");

  const nav = within(screen.getByRole("navigation"));
  expect(nav.getByRole("link", { name: "Feed" }).getAttribute("href")).toBe(
    "/",
  );
  expect(
    nav.getByRole("link", { name: "Label queue" }).getAttribute("href"),
  ).toBe("/labels");
  expect(
    nav.getByRole("link", { name: "Merge log" }).getAttribute("href"),
  ).toBe("/merges");
});

it("shows a not-found page for an unknown route", () => {
  renderAt("/nope");

  expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
});

it.each(["A", "B", "C"] as const)(
  "TierBadge shows Tier %s on its color and names it in full",
  (tier) => {
    const { container } = render(<TierBadge tier={tier} />);

    const badge = container.firstElementChild!;
    expect(badge.className).toContain(`tier-${tier}`);
    expect(badge.textContent).toBe(`Tier ${tier}`);
    expect(badge.querySelector(".visually-hidden")?.textContent).toBe("Tier ");
    expect(badge.hasAttribute("aria-label")).toBe(false);
  },
);

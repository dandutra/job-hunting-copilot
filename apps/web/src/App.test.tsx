import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { App } from "./App";
import { TierBadge } from "./TierBadge";

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

it.each([
  ["/", "Feed"],
  ["/labels", "Label queue"],
  ["/merges", "Merge log"],
  ["/resumes/7", "Tailored resume review"],
])("renders a placeholder at %s", (path, heading) => {
  renderAt(path);

  expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
});

it("opens a Posting directly from its deep link", () => {
  renderAt("/postings/42");

  expect(screen.getByRole("heading", { name: "Posting 42" })).toBeTruthy();
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
    expect(badge.hasAttribute("aria-label")).toBe(false);
  },
);

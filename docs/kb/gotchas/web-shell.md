---
type: gotcha
title: Web app shell and Tier colors
description: How routing, deep links and the Tier color tokens work in apps/web, and what a screen ticket must reuse.
tags: [web, tiers]
sources: ["#61"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-11T10:40:00-05:00
---

`App` holds the routes and the top bar. `main.tsx` wraps it in `BrowserRouter`, and tests wrap it in `MemoryRouter`, so `App` never creates a router itself.

- Routes: `/` feed, `/postings/:id`, `/labels`, `/merges`, `/resumes/:id` (Tailored resume review). A screen ticket replaces its `Placeholder` in `App.tsx`.
- A deep link such as `/postings/42` survives a reload because `nginx.conf` falls back to `/index.html` for any path that is not a file. Vite's dev server does the same.
- Tier colors are the `--tier-{a,b,c}`, `-ink` and `-tint` tokens in `src/tiers.css`. Use `TierBadge` for the letter and `tier-tint-A|B|C` for group headers. `main.tsx` loads that file, so the tint classes work without a `TierBadge` on the page. Do not copy hex values into a screen.
- Tier B uses dark text on its yellow, because white on that yellow fails contrast.
- `TierBadge` reads "Tier A" to a screen reader through a visually hidden prefix. An `aria-label` on a plain `span` is not announced.
- Testing Library does not clean up between tests here (no vitest globals), so each test file calls `afterEach(cleanup)`.

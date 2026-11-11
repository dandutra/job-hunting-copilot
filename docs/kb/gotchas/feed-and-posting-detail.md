---
type: gotcha
title: Feed and Posting detail
description: What GET /postings and GET /postings/:id return and leave out, how the feed screen handles Feed corrections, Lookalikes and Closed Postings, and where it bends the ticket.
tags: [feed, web, api, tiers]
sources: ["#62"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-11T14:00:00-05:00
---
The API is in `apps/api/src/feed/`. The screen is in `apps/web/src/feed/`, mounted by `App.tsx` as one layout route over `/` and `/postings/:id`, so selecting a Posting changes the URL without remounting the list.
- `GET /postings` returns a flat array, already ordered Tier A, B, C and then newest Posted at (ties by id). The screen groups it. A Posting with no `posting_tier` row is left out, because it has no group, so a Posting is invisible until `tier:recompute` runs after its judgement. `GET /postings/:id` still answers for it, with `tier: null`.
- `include=closed` adds Closed and Stale Postings, each with a `state`. Any other value is a 400. The screen puts them in one "Closed and stale" group, not in their Tier group. State is derived on each read with `postingState`.
- The row flag "Capped" and the full cap reason both come from `capsApplied`. The web app turns the cap names into words in `format.ts`, so a new cap in `question-set.ts` shows as its raw name until that map gets an entry.
- The detail's "Why" is computed per request from the judgement the Tier row points at and the config file as it is now (`tierBreakdown`). If someone edits `config/tier-config.json` and does not run `tier:recompute`, the points can disagree with the stored Tier. If the file cannot be read, or the stored answers no longer validate, `why`, `roleFamily` and `workArrangement` are null and the rest still answers.
- The API image now copies `config/` to `/repo/config`, and the feed reads `../../config/tier-config.json` from `apps/api` (or `TIER_CONFIG_PATH`). The Label queue schedule stayed a constant for the opposite reason.
- Sightings with one URL come back as one `links` entry listing every Job source, in Sighting order.
- A Lookalike shows on both Postings of the pair. The hint's Merge calls `POST /lookalikes/:id/merge` and opens the surviving (lower id) Posting. "Not the same" calls `/dismiss`. The screen hides the hint at once and reloads the list.
- The Feed correction API only appends, so "toggles off on a second click" clears the mark in the browser and sends nothing. A reload shows the stored correction again. A real undo needs its own endpoint.
- `j` and `k` move through the Postings in groups that are open, and ignore typing in a field. `/postings/:id` for a Posting the list does not show (a collapsed Tier, a Closed Posting) still opens its detail.
- The screens read the API client from `useApi()` (`ApiProvider` in `main.tsx`). A test passes a stub client with `GET` and `POST`.

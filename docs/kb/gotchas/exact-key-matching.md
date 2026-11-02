---
type: gotcha
title: Exact-key matching rules
description: Where the exact-key matcher departs from a plain key lookup: the board veto, the Workday suffix strip, the 30-day window with no unique key, and where Posting fields come from.
tags: [ingestion, matching]
sources: ["#23"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-02T18:00:00-05:00
---

`SightingMatcher.matchSighting(draft)` in `apps/api/src/matching/` joins drafts on exact keys only. The text rules are a later ticket.

- A Sighting is found by Job source plus listing key, but only among Sightings seen in the last 30 days. The table has no unique key on that pair, because a repost after 30 quiet days reuses the key and must start a new Posting. A per-key Postgres advisory lock inside the transaction stops two concurrent calls from creating the same Sighting twice.
- A draft joins any Posting with a live Sighting whose listing key equals the draft's key, or whose parsed `directUrl` key does. The match works both ways, so an Indeed draft that arrives before its Greenhouse listing still joins it.
- Two different keys on one board never share a Posting. The board of `linkedin:1` is `linkedin`, and the board of `greenhouse:acme:1` is `greenhouse:acme`. A draft whose `directUrl` names another listing of its own board drops the `directUrl`. A candidate Posting that holds a different key on a board the draft touches is skipped.
- One draft can name two Postings by two exact keys. They merge and the absorbed Posting gets a merge log entry. If the veto blocks one of them, they stay apart.
- Workday keys strip a trailing `-N` site suffix only when the rest still contains a digit. `JR100-1` becomes `jr100`, `R-12345-2` becomes `r-12345`, and `R-12345` is left alone.
- Posting fields come from the highest-precedence Sighting. The description comes from the highest-precedence Sighting with full text, then snippet, so an alert with no text never erases a full description. A Sighting also keeps its own text when a later poll returns less.
- `descriptionUpgraded` fires after the transaction commits, when a Posting's kind moves from none or snippet to full. A Posting born full counts as an upgrade from none.
- Merge log rules are `shared_listing_key` and `direct_url`. A Sighting that only refreshes last-seen writes no entry.
- `matchSighting(draft, { now })` takes the poll time so tests can cross the 30-day window.

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

- A Sighting is found by Job source plus listing key, but only among Sightings seen in the last 30 days. The table has no unique key on that pair, because a repost after 30 quiet days reuses the key and must start a new Posting. Every match takes one Postgres advisory lock inside its transaction, so matches run one at a time. A per-key lock is not enough: a merge deletes a Posting that holds other keys, and a concurrent draft on one of those keys would lose its Sighting. Each waiting match holds a pooled connection, which starves other queries on that pool, so adapters must call `matchSighting` one draft at a time. Parallel calls queue for up to 60 seconds and then reject.
- A draft joins any Posting with a live Sighting whose listing key equals the draft's key, or whose parsed `directUrl` key does. The match works both ways, so an Indeed draft that arrives before its Greenhouse listing still joins it.
- Two different keys on one board never share a Posting. The board of `linkedin:1` is `linkedin`, and the board of `greenhouse:acme:1` is `greenhouse:acme`. A draft whose `directUrl` names another listing of its own board drops the `directUrl`. A candidate Posting that holds a different key on a board the draft touches is skipped. The veto reads every Sighting on a Posting, including ones older than 30 days, and it counts the Postings already accepted for the same merge.
- A draft stays on the Posting of its own listing key. A Sighting stores a `directUrl` only with its parsed key. If the URL conflicts with that Posting or does not parse, both are dropped, and a later poll cannot replace a stored direct key with one that conflicts.
- One draft can name two Postings by two exact keys. They merge and the absorbed Posting gets a merge log entry. If the veto blocks one of them, they stay apart.
- Workday keys strip a trailing `-N` site suffix only when N is 1 to 99 with no leading zero, the rest contains a digit, and the rest holds no year segment. `JR100-1` becomes `jr100` and `R-12345-2` becomes `r-12345`. `R-12345`, `JR-2024-0042`, `2024-12345` and `JR-2024-5` are left alone. This is a guess at the id format, and no real Workday data has tested it. An id like `JR-300-7`, where 7 is a sequence number, still loses its last part, and two such ids would collapse into one Sighting with no merge log entry.
- Posting fields come from the highest-precedence Sighting. The description comes from the highest-precedence Sighting with full text, then snippet, so an alert with no text never erases a full description. A Sighting also keeps its own text when a later poll returns less.
- `descriptionUpgraded` fires after the transaction commits, when a Posting's kind moves from none or snippet to full. A Posting born full counts as an upgrade from none. A merge that brings full text into a snippet Posting also fires, so a Posting can fire twice across its life. Decide when Jev attaches whether that second run is wanted.
- Merge log rules are `shared_listing_key` and `direct_url`. A Sighting that only refreshes last-seen writes no entry.
- `matchSighting(draft, { now })` takes the poll time so tests can cross the 30-day window.

---
type: decision
title: Boards are found, not only curated
description: A Company with no board gets one from a stored apply link, so the polled boards grow past the curated CSV; a curated row outranks a found board, and the seed never clears a found one.
tags: [ingestion, companies]
sources: ["#130"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-23T12:00:00-05:00
---

The five board adapters used to poll only the boards in `docs/research/watched-companies.csv` marked `verified`. A company missing from the CSV was never polled, however many matching jobs it posted. The matcher already keeps a JobSpy row's apply link as `direct_url` when it parses as a Greenhouse, Lever, Ashby, SmartRecruiters or Workday listing, and that link names the company's board.

After each poll, `discoverBoards` turns each such link into a board on the Sighting's Company, when that Company has no board and no other Company holds the pair. It sets `ats`, `boardSlug` and `boardFoundAt`. The first run backfills from every stored `direct_url`. A Company that has a board keeps it. A pair another Company holds, compared without case, is skipped and logged, because it usually means two names for one employer, which merge review handles.

`boardFoundAt` marks a found board and is null for a seeded one. The seed clears a board only when `boardFoundAt` is null, so a seed run no longer wipes found boards. A verified CSV row outranks discovery: it takes a pair a found board holds, clears that holder, and makes the board curated. Without that rule the seed would fail on the unique pair.

Rejected: ranking found boards by Title filter passes. A JobSpy row reaches the matcher only after its title passed, so every link already comes from a matching job. Rejected: capping the number of found boards. The cost is more boards per poll, and a cap or slower interval for found boards waits for a poll that runs past its interval.

The risk is a staffing agency or parent company that posts under another name, which ties a board to the wrong Company. Discovery logs each board it adds with the Company name and the source Sighting id, and the fix is to clear that Company's board by hand ([Seed the production database](../runbooks/seed-production.md)). The hand clear nulls `ats` and `boardSlug` but keeps `boardFoundAt`, and discovery skips a Company in that state, because otherwise the same apply link would set the wrong board again on the next poll.

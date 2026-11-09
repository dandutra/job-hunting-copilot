---
type: job-source
title: Ashby job board API
description: One unauthenticated GET returns an Ashby board; publishedAt resets on a republish and isRemote is not a safe sign of remote.
resource: https://api.ashbyhq.com/posting-api/job-board/{slug}
tags: [ingestion, ats]
sources: ["#72"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-09T10:00:00-05:00
---

`AshbyAdapter` reads each Ashby Watched company once an hour, one board at a time, 1 s apart.

- The date is `publishedAt`. A republish resets it, but the matcher keeps a Sighting's earliest date, so a Posting's age does not move forward.
- Rows with `isListed: false` are skipped without an error.
- Locations are `location` plus each `secondaryLocations` entry. A remote row adds "Remote, {place}" for each, and the place must still be in the Search area. `workplaceType` decides whether a row is remote, because `isRemote` is also true on hybrid rows (259 of 800 rows in the live run). `isRemote` is used only when `workplaceType` is missing. A remote row with no place becomes plain "Remote", which is in the area, so a US-only remote job with a blank location is kept. A row with no place that is not remote is a `bad-row`.
- The description is `descriptionPlain`.
- Per-job GETs on this host need a key, so the board dump is the only bulk read. Large boards can pass 10 MB, and the adapter sets no size cap.
- No rate limit is documented. A 403 or 429 is `blocked`, and a 404 is a `fault`.
- A live run on 2026-11-09 read all 13 boards in the seed CSV with a 200. An unknown slug answers 404. The fixtures are trimmed rows from that run.

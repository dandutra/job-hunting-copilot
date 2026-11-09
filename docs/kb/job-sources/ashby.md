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

- The date is `publishedAt`. A republish resets it, so a Posting's age can move forward.
- Rows with `isListed: false` are skipped without an error.
- Locations are `location` plus each `secondaryLocations` entry. `isRemote: true` adds "Remote, {place}" for each, and the place must still be in the Search area, because some hybrid roles carry the flag. A remote row with no place becomes plain "Remote", which is in the area, so a US-only remote job with a blank location is kept. A row with no place and no `isRemote` is a `bad-row`.
- The description is `descriptionPlain`.
- Per-job GETs on this host need a key, so the board dump is the only bulk read. Large boards can pass 10 MB, and the adapter sets no size cap.
- No rate limit is documented. A 403 or 429 is `blocked`, and a 404 is a `fault`.

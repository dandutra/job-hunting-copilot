---
type: job-source
title: Workday career-site API
description: A POST list call pages at 20 and wraps past the total, dates need a detail call, and some tenants cap a query at 2000; RBC's robots.txt disallows its career site.
resource: https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
tags: [ingestion, ats]
sources: ["#5", "#73"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-09T12:00:00-05:00
---

`WorkdayAdapter` reads each Workday Watched company every 3 hours (`minIntervalMs`). It polls one tenant at a time and sends each request 1.5 s after the last, across tenants too. The research is in `docs/research/workday-json-endpoint.md` on the `research/workday-json-endpoint` branch.

- The Watched company's slug is `tenant.wdN/site`, for example `rbc.wd3/RBCGLOBAL1`, and the seed takes it from the row's URL, not from the CSV slug column. A wrong `wdN` answers 422, which is a `fault` on that board. A 429 or 403 is `blocked`.
- The list call is a POST with `limit: 20`, the most Workday accepts (21 returns 400). Page one alone has `total` and `facets`, and later pages report `total: 0`. An offset at or past `total` returns page one again, so the walk stops at `offset >= total` and dedupes by path.
- If a Country facet holds Canada (the facet is found at any nesting depth), the adapter applies it to the rest of the walk. Page one is unfiltered, so the filtered walk restarts at offset 0. Otherwise it would skip rows that the filter puts on page one. The filtered page one gives its own `total`, and the walk ends there. Nvidia, Salesforce and Workday have few Canada jobs, so this saves most of their calls.
- The list has only a relative `postedOn` label. The detail call (`GET .../wday/cxs/{tenant}/{site}{externalPath}`) gives `startDate` (a day, used as the date), `jobDescription` (HTML, stored as `full`) and `location` plus `additionalLocations`.
- The key is `workday:{tenant}:{requisition}`, where the requisition is the token after the last `_` of the path. The path slug keeps the title from the first posting, so it cannot be the key.
- A row whose `locationsText` is "N Locations" cannot be judged from the list. It costs one detail call, and a row judged out of the area goes into an in-memory set, so it costs none until the process restarts. A single-place row outside the area is dropped without a call. A row in the area with no stored Sighting for its key gets the detail call. A known key reuses the stored Sighting's fields and only refreshes last-seen, so a "3 Locations" row that is already stored is not judged again. The title still comes from the list row, because Workday retitles a listed job and the path slug keeps the old title. A key counts as known only when its Sighting was seen in the matcher's 30-day window. A repost after 30 quiet days starts a new Posting, so it gets a fresh detail call, with a fresh date.
- `shouldStop()` is checked before every request. A tenant cut off by it is `incomplete` and not an error, and its drafts so far still go to the matcher.
- A tenant is in `completeBoards` only when every page came back clean and no row was a `bad-row`. A failed detail call on one row is a `bad-row`, which keeps the tenant incomplete. A detail 403 with `errorCode` S22 is a listing that closed after the list call. That makes it a `bad-row`, not `blocked`. Any other 403 on a detail call blocks the tenant. S22 comes from another crawler's code and has not been seen here. A tenant whose walk `total` (the filtered one when Canada applies) is over 2000 is never complete, because some tenants refuse to page past 2000. The walk reads at most 2000 rows, and a warning is logged. No tenant in the seed is known to be over the cap.
- The poll cost is large: RBC has about 850 Postings, so a cold pass is about 43 list calls plus a detail call per in-area row, at 1.5 s each. Later polls only call the list pages. The 3-hour rate follows from that.
- Workday sends no rate-limit headers and sits behind Cloudflare. Other crawlers saw synchronized 429 and 303 bursts across many tenants.
- RBC's robots.txt has `Disallow: /RBCGLOBAL1/` for all agents. That path is the HTML career site, not `/wday/cxs/rbc/RBCGLOBAL1/`, but the intent is plain. RBC is polled anyway, and this is an accepted ToS risk.
- Not tested live: the fixtures are trimmed from the research samples, not from a live run of the adapter.

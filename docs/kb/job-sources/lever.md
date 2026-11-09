---
type: job-source
title: Lever postings API
description: One unauthenticated GET returns every posting of a Lever board; createdAt in epoch ms is the date.
resource: https://api.lever.co/v0/postings/{slug}?mode=json
tags: [ingestion, ats]
sources: ["#72"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-09T10:00:00-05:00
---

`LeverAdapter` reads each Lever Watched company once an hour, one board at a time, 1 s apart.

- The date is `createdAt` in epoch milliseconds.
- Locations come from `categories.allLocations`, or from `categories.location` when that list is empty. A row with neither, such as PolicyMe's talent network, takes its place from `country`, with `CA` read as Canada, because "CA" alone means California to `inSearchArea`.
- `workplaceType: remote` adds "Remote, {place}" for each place, so a remote row placed in "Canada" is kept. A hybrid or onsite row placed only in "Canada" is dropped, because the city is unknown.
- `descriptionPlain` is only the intro. The duties and requirements are in `lists` (a heading in `text`, HTML items in `content`), and the closing text is in `additionalPlain`. The adapter joins all three. Spotify, Maple and Achievers rows have an empty `descriptionPlain`, and some PointClickCare rows have no text at all, so those are `none`.
- A board hosted on `jobs.eu.lever.co` is served from `api.eu.lever.co`. The Watched company row has no region, so the adapter only calls `api.lever.co`, and an EU board answers 404 until the row can say which region it is on.
- No rate limit is documented. A 403 or 429 is `blocked`, and a 404 is a `fault`.
- A live run on 2026-11-09 read all 10 boards in the seed CSV with a 200. An unknown slug answers 404. The fixtures are trimmed rows from that run. One Wave request took 19.6 s against the 30 s request timeout.

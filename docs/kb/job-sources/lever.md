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
- Locations come from `categories.allLocations`, or from `categories.location` when that list is empty.
- The description is `descriptionPlain`.
- A board hosted on `jobs.eu.lever.co` is served from `api.eu.lever.co`. The Watched company row has no region, so the adapter only calls `api.lever.co`, and an EU board answers 404 until the row can say which region it is on.
- No rate limit is documented. A 403 or 429 is `blocked`, and a 404 is a `fault`.

---
type: job-source
title: Greenhouse board API
description: One unauthenticated GET returns a whole Greenhouse board with escaped HTML descriptions; first_published is the date.
resource: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
tags: [ingestion, ats]
sources: ["#72"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-09T10:00:00-05:00
---

`GreenhouseAdapter` reads each Greenhouse Watched company once an hour, one board at a time, 1 s apart.

- The date is `first_published`, which a republish does not change. A missing or invalid date falls back to the poll time.
- `content` is HTML-escaped, so the adapter decodes it once and then strips the tags to plain text.
- `location.name` can hold several places split on `;`. A row is kept if any one is in the Search area.
- `absolute_url` is sometimes the company's own careers page, which has no board slug. The draft URL is built as `boards.greenhouse.io/{slug}/jobs/{id}`, and the key is `greenhouse:{slug}:{id}`, the same key `parseListingKey` reads from that URL.
- No rate limit is documented. A burst can still get a 403 or 429, which the adapter reports as `blocked`. A 404 is a `fault`.
- `?content=true` makes a large board heavy, and the adapter sets no size cap. A board must not be re-read job by job, because the full list is the only bulk read.

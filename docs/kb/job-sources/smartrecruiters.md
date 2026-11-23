---
type: job-source
title: SmartRecruiters posting API
description: A paged GET list of a company's postings plus one detail call for the description and URL; the Search area is judged from fullLocation, never from country.
resource: https://api.smartrecruiters.com/v1/companies/{slug}/postings
tags: [ingestion, ats]
sources: ["#76"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-23T14:45:00-05:00
---

`SmartRecruitersAdapter` reads each Watched company with `ats = smartrecruiters` once an hour, one board at a time, 1 s between every request across boards. A later company needs only a CSV row. Ubisoft (slug `Ubisoft2`) is the only one today.

- The list is `GET .../postings?limit=100&offset=N`. The offset advances by 100 while it is below `totalFound`, and a row seen on two pages counts once. A row with no `id` or no location is a `bad-row`, so that board is not complete for the poll.
- A list row has `id`, `name`, `releasedDate` (ISO, used as the posting date) and a `location` object with `city`, `region`, `country`, `remote`, `hybrid` and `fullLocation`. The adapter judges the Search area from `fullLocation`, or from city plus region when it is empty. It never reads `country`, which is a lower-case code like "ca", and "ca" alone reads as California. `remote: true` adds "Remote, {place}", so a remote job placed in Montreal, QC, Canada is kept. `hybrid` is ignored.
- The detail call is `GET .../postings/{id}`. `postingUrl` becomes the Sighting url, and its key from `parseListingKey` equals the adapter's `smartrecruiters:{slug}:{id}` lower-cased. `jobAd.sections` holds `companyDescription`, `jobDescription`, `qualifications` and `additionalInformation`, each with HTML in `text`. The adapter joins them in that order into a `full` description. A missing id answers 404, which is a `bad-row`.
- A row with a stored Sighting inside the 30-day key window skips the detail call. Its draft keeps the stored url, date and description but takes the title and location from the current list row. Reusing the stored location would write a stale place back through `refreshSighting` when a job moves.
- A failing list title is skipped before the detail call, as in Workday, see [Ingest scheduler](../gotchas/ingest-scheduler.md). Every recorded Ubisoft title fails the Title filter today.
- An unknown slug answers 200 with `totalFound: 0` and an empty `content`, not a 404. The adapter logs "{name}: board returned 0 jobs, check the slug", and the scheduler never closes anything from an empty listing.
- A 429 or 403 is `blocked`. Any other non-200 list answer is a `fault`. No rate limit is documented.
- A live run on 2026-11-23 against Ubisoft2 got a 200 with `totalFound` 225, 3 list calls (offsets 0, 100, 200) and 221 of 225 rows outside the Search area. The 4 in-area rows had no stored Sighting, so there were 4 detail calls, and the whole poll took about 10 s. The same run after the title skip made no detail call and produced no draft, because all 4 in-area titles fail the Title filter, and took about 5 s. The fixtures are trimmed rows from that run and match the live shape, so nothing was re-recorded.

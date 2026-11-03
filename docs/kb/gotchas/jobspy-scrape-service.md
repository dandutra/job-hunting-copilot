---
type: gotcha
title: JobSpy scrape service
description: What POST /scrape promises and where JobSpy surprises it: errors by board, no descriptions on LinkedIn, proxies from the environment, and fixtures that were not recorded from a run.
tags: [ingestion, jobspy]
sources: ["#19"]
generated:
  by: claude-opus-5-5
  at: 2026-11-03T18:30:00-05:00
---

`apps/jobspy` serves `POST /scrape` for one board per call. The NestJS adapter, not this service, decides the search terms and the schedule.

- `hours_old` below 0 or `results_wanted` below 1 is a 422, because JobSpy raises `ValueError` on them and a caller bug would look like a broken scraper. A blank `search_term` or `location` is also a 422, because JobSpy drops an empty string and would run an unfiltered board search.
- `errors` is an object keyed by board, copied from `jobs.attrs["errors"]`, for example `{"linkedin": "429 ... (blocked: use a proxy)"}`. A block is a 200 with rows that may be empty. Only an exception inside the service is a 500, and the adapter must treat a 500 as a broken scraper, not a blocked board.
- `linkedin_fetch_description` stays off. Without it LinkedIn rows have a null `description`, `job_type` and `job_level`, and no salary. Indeed rows carry the description either way. Turning it on costs one extra request per LinkedIn job with no delay between them, which is the main burst risk for a 429.
- Indeed searches always pass `country_indeed="Canada"`.
- Proxies come only from `JOBSPY_PROXIES` (comma-separated `user:pass@host:port`), read on each request. The request body has no proxy field, and an extra field in it is ignored. Compose passes the variable to the `jobspy` service in both files.
- Rows are JobSpy's columns with NaN and NaT as `null`, and dates as `YYYY-MM-DD`. JobSpy joins list fields such as `emails` and `skills` into one comma-separated string before it builds the frame, so they arrive as strings. Dates have no time, and Indeed's is a UTC date.
- The files in `apps/jobspy/tests/fixtures/` were not recorded from a run. They are the trimmed sample rows from the JobSpy research, which came from a real run on 2026-10-29. CI makes no network calls.

---
type: gotcha
title: JobSpy scrape service
description: What POST /scrape promises and where JobSpy surprises it: errors by board, no descriptions on LinkedIn, proxies from the environment, and fixtures that were not recorded from a run.
tags: [ingestion, jobspy]
sources: ["#19", "#124", "#129", "#136"]
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
- Both boards get one quoted OR query of the `searchTerms` in `config/title-filter.json`, for example `"software developer" OR "software engineer" OR ...`. Each term must be quoted because Indeed matches unquoted words anywhere in the posting. A live check on 2026-11-20 against the local service (location "Toronto, ON", `hours_old` 24, `results_wanted` 50) showed the same query works on both boards:
  - Indeed: the OR query of the five terms returned 21 rows, and they covered all 20 unique rows of the five quoted single-term searches (8, 8, 3, 2 and 0, with one row found by two terms). The unquoted single terms returned far more (49, 49, 5, 16, 10), so compare quoted with quoted.
  - LinkedIn: the OR query returned 20 rows whose titles match all five terms (Software Engineer, Software Developer, Full-Stack Developer, AI Engineer, AI Developer). Every LinkedIn request from the Mac, which has no `JOBSPY_PROXIES`, got a 429 ("blocked: use a proxy"). Each returned at most one page (about 20 to 30 rows) and sometimes none, so the single-term comparison on LinkedIn was only partial.
  - The hourly rotation of one term per poll was the fallback for a board that ignores OR. It was not built, because neither board needed it. Revisit it only if a later run shows a board dropping terms.
  - One ingest tick after the build: `jobspy-linkedin` returned 20 rows with a 429 alert and dropped 1 outside the Search area and 9 of 19 by title. `jobspy-indeed` returned 1 row over a one-hour window, dropped as outside the area. Neither hit the results cap.
- A live check on 2026-11-24 from the Mac (no `JOBSPY_PROXIES`) ran the same OR query for London and Halifax (`hours_old` 24, `results_wanted` 50). LinkedIn returned Toronto 20 rows (429), London 10 (429) and Halifax 10. Indeed returned Toronto 27, London 3 and Halifax 1. JobSpy's location search is a radius, so most rows are not in the place. `inSearchArea` kept LinkedIn London 4 of 10 (Waterloo and Kitchener dropped), LinkedIn Halifax 4 of 10, Indeed London 1 of 3 and Indeed Halifax 1 of 1. LinkedIn's "Greater Halifax Metropolitan Area" names no province, so it is dropped, along with "Nova Scotia, Canada", "Dartmouth, Nova Scotia, Canada" and "Bedford, Nova Scotia, Canada". Expect LinkedIn Halifax to lose some real rows to that rule.
  - One local ingest tick after the build: `jobspy-linkedin` 26 drafts in 24.2 s, `jobspy-indeed` 23 in 1.1 s, `jobspy-linkedin-london` 3 in 5.4 s, `jobspy-indeed-london` 1 in 0.4 s, `jobspy-linkedin-halifax` 0 in 0.3 s and `jobspy-indeed-halifax` 0 in 0.2 s, about 32 s for JobSpy. Every Halifax row in the area failed the Title filter. Four London sightings were stored as `jobspy-linkedin` and `jobspy-indeed`. The Droplet was not checked, so its 429 rate for the extra places is unknown.
- `site` takes only `linkedin` and `indeed`. JobSpy's `google` site returns no rows from the Mac or the Droplet, because Google serves its client a JavaScript-only page. The live check is in [Google Jobs through JobSpy](../job-sources/google-jobs.md). `ScraperInput` also rejects `proxies=None`, so a script that builds one directly passes `proxies` only when it is set. `scrape_jobs` accepts `None`.
- The files in `apps/jobspy/tests/fixtures/` were not recorded from a run. They are the trimmed sample rows from the JobSpy research, which came from a real run on 2026-10-29. CI makes no network calls.

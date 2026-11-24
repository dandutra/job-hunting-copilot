---
type: job-source
title: Google Jobs through JobSpy
description: Not polled. Google serves JobSpy a JavaScript-only page, so every search returns no rows from the Mac and the Droplet alike; a newer JobSpy has the same Google code.
resource: https://www.google.com/search?udm=8
tags: [ingestion, jobspy, not-polled]
sources: ["#129"]
generated:
  by: claude-opus-5-5
  at: 2026-11-24T12:00:00-05:00
---

Google Jobs indexes ATS boards across companies and can be searched by title, which made it a candidate for finding Postings and boards past the curated CSV. #129 planned it as `jobspy-google`, a third JobSpy site next to LinkedIn and Indeed. It was not built, because JobSpy cannot read Google's answer.

- JobSpy 1.4.1 builds the query as `<search_term> jobs near <location> <time filter>`, sends it to `https://www.google.com/search?udm=8`, and parses the job cards from the HTML. The shortest time filter is "since yesterday". A row's `job_url` is the apply link and its `date_posted` comes from text like "3 days ago".
- A live check on 2026-11-24 ran from the Mac and from the production `jobspy` container on the Droplet, both without `JOBSPY_PROXIES`. Both got the same answer. The first request returned HTTP 200 with Google's "enable JavaScript" interstitial (a `/httpservice/retry/enablejs` redirect), no CAPTCHA and no "unusual traffic" text, and none of the markup the parser looks for (`Yust4d`, `data-async-fc`). The quoted OR query of the five `searchTerms` and each quoted single term (location "Toronto, ON", `hours_old` 24, `results_wanted` 50) each returned 0 rows with `errors` `{"google": "no job data returned"}`.
- Google serves this page to the HTTP client itself, not to one IP, so neither a proxy nor the Droplet's address changes it. A hand-built `google_search_term` changes only the query text and gets the same page.
- JobSpy 1.5.0, released 2026-11-20, has a `google/` package and `util.py` identical to 1.4.1, so upgrading does not help.
- Reading Google Jobs now needs a headless browser. That is a scraper of our own, which [Scraped boards are a job source](../decisions/scraped-boards-are-a-job-source.md) rules out, so it would need a new decision. Revisit when a JobSpy release changes its Google scraper.
- Board discovery ([Boards are found, not only curated](../decisions/boards-are-found-not-only-curated.md)) does not depend on Google. It reads stored apply links from any source, such as Indeed's `job_url_direct`.

---
type: job-source
title: Adzuna search API
description: A keyed search over Canadian jobs, polled hourly for at most 3 pages; the snippet is cut at 500 characters, the free-tier cap is unknown, and no live poll has run yet.
resource: https://api.adzuna.com/v1/api/jobs/ca/search/{page}
tags: [ingestion, aggregator]
sources: ["#74"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-23T10:00:00-05:00
---

`AdzunaAdapter` polls once an hour. Each call sends `what` (from `ADZUNA_WHAT`, default "software developer"), `where=Toronto`, `max_days_old=2`, `sort_by=date` and `results_per_page=50`. It asks for the next page until one comes back short, or until `MAX_PAGES` (3) is reached. A short page is counted on the raw rows, before the Search area filter, so a page of 50 rows that are mostly out of area still asks for the next one. At 24 polls a day that is at most 2,160 calls a month.

The free-tier limits are not known. The research on the `research/adzuna-canada` branch (`docs/research/adzuna-canada.md`) found published defaults of 25 hits a minute, 250 a day, 1,000 a week and 2,500 a month, but the account page is now the only place that shows them. The real cap stays unknown until someone reads it there and posts it on #74. If it is below 2,160 a month, lower `MAX_PAGES`.

## Window

The adapter ignores the poll window. `max_days_old=2` overlaps each hourly poll, and a rerun is safe because `matchSighting` updates by listing key. After an ingest outage longer than 2 days the scheduler's window reaches back up to 7 days, but the adapter still asks for 2, so listings older than that are not recovered.

## Drafts

- The listing key is `adzuna:{id}`. The id may arrive as a string or a number, and both are read the same way.
- The URL is `redirect_url`, an Adzuna tracking link. It is never parsed for a key, and there is no `directUrl`.
- The description is the snippet, which Adzuna cuts at 500 characters, so the Posting is Thin.
- `created` is the date. It falls back to the poll time when it is missing or unreadable. Whether it is the employer's date or Adzuna's index date is unknown.
- Title, company and snippet go through `htmlToText`, because Adzuna may wrap matched words in tags. Without it the Title filter would read "strong" as a word and drop the row without a trace. Location is read as it comes. This is unverified against a live response, because the fixtures cannot show whether live fields carry markup. The first live poll must check title, company and description for tags.

## Search area

A row is in the area if its `location.display_name` passes `inSearchArea`, or its `location.area` path joined with commas does. A row with neither field is a `bad-row`, so a lost field cannot make every row look out of area. `distance` is not sent, and the research says the API's default is 5 km, so GTA suburbs may be missed until a live run shows what comes back.

## Errors

- With no app id or no app key the adapter logs one warning at startup and makes no calls. That is not a fault, so the stack runs before the key exists.
- A 401 or 429 is `blocked`. Any other status, an unreadable body or a network error is a `fault`. A 410 ("Authorisation failed" in the OpenAPI spec) would be a fault and not `blocked`, which is unverified.
- The adapter alerts for its own errors, and no message holds the URL, because the app key is in the query string.
- When page 2 fails, the page 1 drafts are kept and the cursor holds back.
- If exactly 50 or 100 results exist, the adapter asks for a page past the end. What Adzuna answers there is undocumented.

## Live run

None yet, because there is no key. On 2026-11-23 a call with invalid keys returned HTTP 401 with the body `{"__CLASS__":"Adzuna::API::Response::Exception","exception":"AUTH_FAIL","display":"Authorisation failed"}`, which is the status the adapter treats as `blocked`.

The fixtures were written by hand from the documented Job schema and were not recorded. The first live poll with a key must confirm the shape. Then re-record the fixtures and update this section, as `.claude/rules/ingestion.md` says. Scrub the app id first: the documented `redirect_url` carries `utm_source`, probably the app id, and the repo is public.

## Terms

From the research note: "Personal job search" is a permitted use. The terms say nothing about storing results. One account only is allowed. On termination, Adzuna data must be removed.

## Settings

`ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are secrets and `ADZUNA_WHAT` is a variable, all in the `production` environment ([Deploy](../runbooks/deploy.md)). The Deploy step rewrites `.env` on every run, so keys put only in the Droplet's `.env` are blanked at the next deploy, and Adzuna silently stops polling. The scheduler side is in [Ingest scheduler](../gotchas/ingest-scheduler.md).

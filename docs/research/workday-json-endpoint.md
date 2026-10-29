# Workday career-site JSON endpoint

Research for ticket #5. Probed on 2026-10-29 against two Toronto-employer tenants, Manulife (`manulife.wd3`, site `MFCJH_Jobs`) and RBC (`rbc.wd3`, site `RBCGLOBAL1`). I sent about 35 unauthenticated requests with at least 1.5 s between them. Terms follow [the glossary](../kb/glossary.md).

## Summary

1. Each Watched company on Workday is the triple (tenant, `wdN` host, site), and its list call is `POST https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs`. The career-site URL `https://<tenant>.<wdN>.myworkdayjobs.com/<site>` gives all three, and a wrong `wdN` returns HTTP 422.
2. The body is `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`. `limit` is capped at 20 (21 returns HTTP 400). `total` and `facets` come only on the first page, and an offset at or past `total` returns page one again instead of an empty list.
3. Location filters are facets. Their names and ids differ per tenant (Manulife uses `locations`, RBC uses `City` and `Country`), so read them from the first page's `facets`. An unknown facet name returns HTTP 400, and `searchText` is a stemmed full-text search.
4. The list gives only a relative label (`postedOn: "Posted Today"`, `"Posted Yesterday"`, `"Posted N Days Ago"`, `"Posted 30+ Days Ago"`). The detail call `GET .../wday/cxs/<tenant>/<site><externalPath>` gives `startDate: "YYYY-MM-DD"`, a date with no time, and the HTML page's JSON-LD `datePosted` holds the same value.
5. No rate-limit headers appear and the host is behind Cloudflare. Another crawler logged synchronized HTTP 429 and 303 bursts across many tenants, and some tenants cap a query at 2000 results. RBC's robots.txt disallows its career-site path for all agents, which is a ToS risk to record.

## Details

### URL pattern per tenant

The career site's front end at `https://<tenant>.<wdN>.myworkdayjobs.com/<site>` (optionally `/en-US/<site>`) calls the CXS API under `/wday/cxs/<tenant>/<site>/`. The `wdN` part names a Workday data centre and varies by tenant (wd1, wd3, wd5 and others appear in scraper configs, for example [InternRadar's connector](https://github.com/lakshya14-ds/InternRadar/blob/master/internradar-backend/app/connectors/workday_connector.py)). Jobseek parses all three parts from the board URL with the regex `([\w-]+)\.wd(\d+)\.myworkdayjobs\.com/(?:[a-z]{2}-[A-Z]{2}/)?(.+?)/?$` ([monitor source](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/monitors/workday.py)).

The wrong data centre returns HTTP 422 with an empty message:

```
POST https://manulife.wd5.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/jobs
Content-Type: application/json
{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}

422 {"errorCode":"HTTP_422","errorCaseId":"...","httpStatus":422,"message":"","messageParams":{}}
```

[ambicuity/New-Grad-Jobs](https://github.com/ambicuity/New-Grad-Jobs/blob/main/scripts/ngj/sources/workday.py) documents the same reading: "HTTP 422 with an empty message means the tenant/site ... does not exist on that `wdN` data centre".

One tenant can host several sites. Jobseek discovers them from `Sitemap:` lines in `robots.txt` and collapses the same requisition published on several sites ([monitor docstring](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/monitors/workday.py), [KB note](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/workspace/kb/workday-multisite-tenant-returns-all-jobs-across-all-sites-r.md)). Manulife's robots.txt lists one sitemap. RBC's lists none.

### List call and response

Request I ran:

```
POST https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/jobs
Content-Type: application/json
Accept: application/json
{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}
```

Trimmed response (HTTP 200):

```json
{
  "total": 624,
  "jobPostings": [
    {
      "title": "Senior Technology Project Manager, Group Functions Technology",
      "externalPath": "/job/Toronto-Ontario/Senior-Technology-Project-Manager--Group-Functions-Technology_JR26100844-1",
      "locationsText": "Toronto, Ontario",
      "postedOn": "Posted Today",
      "bulletFields": ["JR26100844", "Toronto"]
    }
  ],
  "facets": [
    {"facetParameter": "Location_Country", "descriptor": "Location Country",
     "values": [{"descriptor": "Canada", "id": "a30a87ed25634629aa6c3958aa2b91ea", "count": 191}]},
    {"facetParameter": "locationMainGroup",
     "values": [{"facetParameter": "locations", "descriptor": "Locations",
                 "values": [{"descriptor": "Toronto, Ontario", "id": "90905028607c019c77b34f1f8257fee2", "count": 124}]}]}
  ],
  "userAuthenticated": false
}
```

Each posting has exactly five keys on both tenants: `title`, `externalPath`, `locationsText`, `postedOn`, `bulletFields`. `bulletFields[0]` was the requisition id on both tenants (`JR...` at Manulife, `R-...` at RBC). The rest of `bulletFields` is tenant-defined. `locationsText` becomes `"N Locations"` when a Posting has more than one location, so the real list of locations needs the detail call.

Facets nest. Manulife puts `locations` inside a `locationMainGroup` wrapper, so a parser must walk `values` recursively and take `facetParameter` from the innermost level.

### Paging

- `limit` above 20 fails. I sent `limit` 21, 50 and 100, and each returned `400 {"errorCode":"HTTP_400",...}`. Jobseek's docstring records the same rule ("Max `limit` per request is 20 (higher values return 400)"), and ambicuity hard-codes `WORKDAY_MAX_PAGE_LIMIT = 20`.
- `total` and `facets` come only on the first page. With the Toronto facet, `offset: 0` gave `total: 124` and 7 facets. `offset: 20` gave `total: 0`, 0 facets and 20 postings. `offset: 120` gave `total: 0` and 4 postings.
- An offset at or past `total` wraps around. `offset: 124` and `offset: 300` both returned `total: 124`, the full facets, and the same 20 postings as `offset: 0`. A loop that stops on an empty page never stops, and a loop that stops on a short page re-reads page one when `total` is a multiple of 20. ambicuity's loop stops on `len(items) < page_limit` ([source, around line 411](https://github.com/ambicuity/New-Grad-Jobs/blob/main/scripts/ngj/sources/workday.py)), so it has that exposure. Jobseek stops on `offset >= total` using the first page's `total` ([source, `_paginate_query`](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/monitors/workday.py)).
- Some tenants cap a single query at 2000 results. Jobseek splits such tenants into per-facet queries ("Some tenants cap results at 2000 per query", same file). I did not hit this cap. Manulife has 624 Postings and RBC has 852.
- Jobseek notes that "inventories can churn between page requests and some tenants occasionally repeat rows at an offset", and it dedupes paths (same file). I did not observe repeats.

At 20 per page, a full RBC pass is 43 requests and a full Manulife pass is 32. A Toronto-only Manulife pass is 7.

### Search and location filters

`appliedFacets` maps a tenant's `facetParameter` to a list of facet value ids:

```
POST .../wday/cxs/manulife/MFCJH_Jobs/jobs
{"appliedFacets":{"locations":["90905028607c019c77b34f1f8257fee2"]},"limit":20,"offset":0,"searchText":""}
-> 200, total 124 (all "Toronto, Ontario" or multi-location)

POST .../wday/cxs/rbc/RBCGLOBAL1/jobs
{"appliedFacets":{"City":["aea8255cf4560116ecae8d4e63e50000"]},"limit":20,"offset":0,"searchText":""}
-> 200, total 14 (descriptor "CAN-ON-TORONTO")
```

Facet names on the first page, per tenant:

| Tenant | Facet parameters |
|---|---|
| Manulife | `jobFamilyGroup`, `Location_Country`, `Location_Region_State_Province`, `workerSubType`, `timeType`, `locations` (inside `locationMainGroup`), `distance` |
| RBC | `Category`, `Sub_Category`, `Country`, `State_Province`, `City`, `Full_Time___Part_Time`, `company`, `workerSubType` |

The same value can have the same id on different tenants. Canada is `a30a87ed25634629aa6c3958aa2b91ea` at both. Most ids are tenant-specific.

A facet name the tenant does not have fails the whole call. Sending `{"City":[...]}` to Manulife returned `400 HTTP_400`.

Facet value lists looked truncated at 55 entries. RBC's `State_Province`, `City` and `company` facets, and Manulife's `Location_Region_State_Province`, each had exactly 55 values. Toronto may be missing from a tenant's list on some days. (Inferred from the counts, not verified.)

A facet can also undercount. RBC's `City` = `CAN-ON-TORONTO` returned 14 Postings, `Country` = Canada returned 637, and `searchText: "Toronto"` returned 222, most with `locationsText` "TORONTO, Ontario, Canada". RBC's `City` values mix regions ("North America", "Asia/Pacific") with cities, and they sum to 152 of 852 Postings, so most RBC Postings carry no `City` value. For RBC, filtering by `Country` and then by `locationsText` or the detail `location` is safer than the `City` facet.

`searchText` is a stemmed full-text search that reaches beyond the title:

| `searchText` (Manulife, no facets) | `total` |
|---|---|
| `""` | 624 |
| `developer` | 624 (top hits: "Business Development Associate") |
| `java` | 36 |
| `"software engineer"` | 82 |
| `zzqxjvv` | 0 |

`developer` matching all 624 Postings suggests it stems to "develop" and searches descriptions. That last part is inferred, not verified. Matches come back in relevance order, not date order.

With empty `searchText`, the Manulife first page was all "Posted Today". The RBC first page went Today, Today, Yesterday, 2, 3, 7 ... 29 Days, then four "30+", then Today again. The default sort is not reliably newest first, so a poll cannot stop at the first old Posting.

### Posted-date field and its precision

The list's `postedOn` is a relative English label, computed when the request is made. Values seen on RBC page one: `Posted Today`, `Posted Yesterday`, `Posted 2 Days Ago` ... `Posted 29 Days Ago`, `Posted 30+ Days Ago`. Precision is one day for 0 to 29 days and unbounded beyond that.

The detail call gives an exact date:

```
GET https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/job/Toronto-Ontario/Senior-Technology-Project-Manager--Group-Functions-Technology_JR26100844-1
Accept: application/json
```

```json
{
  "jobPostingInfo": {
    "id": "621daea738691001b73b52d5eed20001",
    "title": "Senior Technology Project Manager, Group Functions Technology",
    "jobDescription": "<p>Working within Technology Business Management ... </p>",
    "location": "Toronto, Ontario",
    "postedOn": "Posted Today",
    "startDate": "2026-10-29",
    "endDate": "2026-11-12",
    "timeType": "Full time",
    "jobReqId": "JR26100844",
    "jobPostingId": "Senior-Technology-Project-Manager--Group-Functions-Technology_JR26100844-1",
    "jobPostingSiteId": "MFCJH_Jobs",
    "country": {"descriptor": "Canada", "id": "a30a87ed25634629aa6c3958aa2b91ea"},
    "jobRequisitionLocation": {"descriptor": "CAN, Ontario, Toronto, 200 Bloor Street East", "country": {"alpha2Code": "CA"}},
    "externalUrl": "https://manulife.wd3.myworkdayjobs.com/MFCJH_Jobs/job/Toronto-Ontario/...",
    "timeLeftToApply": "13 days left to apply",
    "jobPostingEndDateAsText": "End Date: November 12, 2026",
    "canApply": true,
    "posted": true
  },
  "hiringOrganization": {"name": "...", "url": ""},
  "similarJobs": [],
  "userAuthenticated": false
}
```

The label and the date agreed in each check:

| Posting | `postedOn` | `startDate` |
|---|---|---|
| Manulife JR26100844 | Posted Today | 2026-10-29 |
| Manulife JR26100312 | Posted Yesterday | 2026-10-28 |
| RBC R-0000150349 | Posted 30+ Days Ago | 2026-09-23 |

The detail response has no field with a time of day. The job's HTML page (`GET https://manulife.wd3.myworkdayjobs.com/en-US/MFCJH_Jobs/job/...`) carries a schema.org `JobPosting` in `<script type="application/ld+json">` with `"datePosted": "2026-10-28"` and `"validThrough": "2026-11-27"`. Those equal `startDate` and `endDate` for JR26100312. Jobseek maps `startDate` to its `date_posted` ([scraper source](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/scrapers/workday.py), `_parse_detail`).

For the Posted at of a Workday Sighting, the detail `startDate` is the best field. It has day precision, so Postings first seen on the same day tie on age. The first-seen time of the hourly poll can break the tie, but it is our time, not Workday's.

The RBC detail also had `additionalLocations: ["Singapore, Singapore"]`. Jobseek reads a `remoteType` field (`remote`, `flexible`, `hybrid`) for the Work arrangement ([scraper source](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/scrapers/workday.py), `_parse_location_type`). Neither of my three detail responses had `remoteType`, so it is tenant-dependent (not verified on a tenant that sets it).

### The description call

The description is `jobPostingInfo.jobDescription` in the detail call above, as HTML. The URL is the list's `externalPath` appended to `/wday/cxs/<tenant>/<site>`, and it needs only `Accept: application/json`. RBC's description HTML began with dozens of nested `<div>` tags, so it needs sanitizing.

Error shapes:

- A path that never existed returned `404 {"errorCode":"S21","message":"not found: Job_Posting_Anchor_ID=Not-A-Real-Job_JR00000000"}`. I ran this request.
- A closed or unlisted Posting returns `403 {"errorCode":"S22","message":"permission denied"}`, according to jobseek's `_is_gone_response` ([scraper source](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/scrapers/workday.py)). Jobseek treats any other 403 as a real block. I did not reproduce S22.

## Gotchas

- Paging past the end returns page one again with a non-zero `total`. Stop on `offset >= total`, taking `total` from the `offset: 0` response only, because later pages report `total: 0`.
- `limit` above 20 returns HTTP 400.
- A list POST without `Content-Type: application/json` returned `500 {"errorCode":"HTTP_500",...}`.
- The wrong `wdN` host returns 422, and an unknown facet name returns 400. Neither error message says why.
- The `externalPath` slug keeps the title from when the job was first posted. RBC's path `.../Managing-Director-Executive-Director-Director--Relationship-Management--Wealth-Management_R-0000150349-1` returned the title "Senior Relationship Manager, Private Banking". Key a Sighting on the requisition id (`jobReqId`, or the token after the last `_` with any `-N` copy suffix removed), not on the slug. Jobseek's `_SITE_COPY_SUFFIX_RE` strips that suffix ([monitor source](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/monitors/workday.py)).
- The same requisition can appear on several sites of one tenant with a `-1` or `-2` suffix. Those are one Posting.
- Facet names and ids are per tenant, and a facet such as RBC's `City` can cover a small share of Postings. Store the location facet per Watched company and check it against `Country` plus `locationsText`.
- The list order is not date order, so a poll cannot stop early at the first old Posting. The list `postedOn` label also cannot rank anything past 29 days.
- Workday sends no rate-limit headers. The responses had `server: cloudflare`, `cf-ray`, `cache-control: no-store` and `x-wd-request-id`. Jobseek logged a synchronized 429 burst across 15 `*.wd1.myworkdayjobs.com` tenant hosts over about 15 minutes ([issue #9180](https://github.com/colophon-group/jobseek/issues/9180)), and 44 list calls failing with HTTP 303 across 21 boards ([issue #5715](https://github.com/colophon-group/jobseek/issues/5715)). Its code comment says "Workday tenants do honour 429 Retry-After hints". It retries 3 times with backoff from 1 s and does not follow a 303, because following it turns the POST into a GET. Throttling should be per provider, not per tenant host, because one Workday event hits many tenants at once.
- Jobseek also logged intermittent 500s on some sites of a multi-site tenant ([KB note](https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/workspace/kb/workday-multisite-discovery-shows-intermittent-500-errors-on.md)), and large `appliedFacets` arrays fail with tenant-dependent errors above about 100 ids (`_MAX_FACET_VALUES_PER_QUERY`).
- No CSRF token is needed. My requests sent none and all succeeded. ambicuity still fetches an optional `X-Calypso-CSRF-Token` from the site page and agrees that "the CXS API answers without a token".
- RBC's robots.txt has `User-agent: *` with `Disallow: /RBCGLOBAL1/`. That disallows the HTML career site, not `/wday/cxs/rbc/RBCGLOBAL1/` (a different path prefix), but the intent is plain. Manulife's has `Allow: /MFCJH_Jobs/`. Neither mentions `/wday/cxs/`. Record this as ToS risk in the Workday job-source entry.
- The sitemap is no shortcut. Manulife's `siteMap.xml` listed 100 URLs out of 624 Postings and had no `<lastmod>`.
- The RBC `company` facet ("Platform") lists internal recruiting groups, some named after staff. Do not store facet descriptors in git.

## Open questions

- Is `startDate` the first posting date, or does it reset when an employer reposts or extends a job? I did not observe a repost. If it resets, Posted at must come from our earliest Sighting, which the glossary already prescribes.
- Which time zone defines the `startDate` day and the "Today" boundary: the tenant's, the data centre's or UTC? I made all checks at 21:00 UTC, when Toronto and UTC share a date.
- Does the list body accept a sort parameter for newest first? I found none in the scrapers I read and did not test one.
- At what request rate does Workday start returning 429 for one client IP? Nobody I read published a threshold. Jobseek's limit was 5 concurrent queries per run.
- Do the Toronto banks, pension funds and insurers beyond Manulife and RBC use the same `/wday/cxs` front end? I tested only those two tenants.
- Does the 2000-result cap apply to any Toronto target? Both tested tenants were under 1000.
- Is the 55-value facet truncation real, and does Workday order the values by count? (Inferred from counts.)

## Sources

Requests I ran on 2026-10-29, unauthenticated, at least 1.5 s apart:

- `POST https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/jobs` with `limit` 20, 21, 50, 100. Offsets 0, 20, 120, 124, 140, 300. Facets none, `locations`, `City`. `searchText` "", `developer`, `java`, `"software engineer"`, `zzqxjvv`. Also once with no Content-Type.
- `POST https://manulife.wd5.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/jobs` (wrong data centre).
- `POST https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/jobs` with no facets, `City`, `Country`, and `searchText: "Toronto"`.
- `GET https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/job/Toronto-Ontario/Senior-Technology-Project-Manager--Group-Functions-Technology_JR26100844-1`
- `GET https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/job/Boston-Massachusetts/Senior-Product-Delivery-Analyst_JR26100312`, plus the same path under `/en-US/MFCJH_Jobs` for the HTML and JSON-LD.
- `GET https://manulife.wd3.myworkdayjobs.com/wday/cxs/manulife/MFCJH_Jobs/job/Toronto-Ontario/Not-A-Real-Job_JR00000000`
- `GET https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/Hong-Kong-Hong-Kong/Managing-Director-Executive-Director-Director--Relationship-Management--Wealth-Management_R-0000150349-1`
- `GET https://rbc.wd3.myworkdayjobs.com/robots.txt`, `GET https://manulife.wd3.myworkdayjobs.com/robots.txt`, `GET https://manulife.wd3.myworkdayjobs.com/MFCJH_Jobs/siteMap.xml`

Open-source code and issues:

- colophon-group/jobseek, Workday list monitor: https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/monitors/workday.py
- colophon-group/jobseek, Workday detail scraper: https://github.com/colophon-group/jobseek/blob/main/apps/crawler/src/core/scrapers/workday.py
- colophon-group/jobseek, multi-site KB notes: https://github.com/colophon-group/jobseek/tree/main/apps/crawler/src/workspace/kb
- colophon-group/jobseek issue #5715 (303 burst): https://github.com/colophon-group/jobseek/issues/5715
- colophon-group/jobseek issue #9180 (429 burst): https://github.com/colophon-group/jobseek/issues/9180
- ambicuity/New-Grad-Jobs, Workday source: https://github.com/ambicuity/New-Grad-Jobs/blob/main/scripts/ngj/sources/workday.py
- lakshya14-ds/InternRadar, Workday connector (tenant URL list): https://github.com/lakshya14-ds/InternRadar/blob/master/internradar-backend/app/connectors/workday_connector.py
- christopherlam888/workday-scraper (Selenium, filters on the text "posted today", no JSON calls): https://github.com/christopherlam888/workday-scraper/blob/main/workday_scraper/__main__.py

# Adzuna Canada terms

Research for ticket #6. Sources were read on 2026-10-29 without an API key, so no live response was inspected.

## Summary

1. Canada is supported: `GET https://api.adzuna.com/v1/api/jobs/ca/search/{page}?app_id=...&app_key=...`, with `max_days_old` and `sort_by=date` both documented [S1][S2].
2. Each result has `id`, `title`, `created` (ISO 8601), `company.display_name`, `location.display_name` and `location.area`, `redirect_url`, salary and contract fields, and a `description` truncated to 500 characters [S1]. Adzuna never returns the full description.
3. `redirect_url` is an Adzuna tracking link (`adzuna.../jobs/land/ad/<id>`) that "redirects to the advertisement on the advertiser's site" [S1][S3]. Whether the advertiser is the employer's ATS or another board is not documented.
4. The current terms permit "Personal job search" [S4]. They have no clause on storing results, so storing Sightings in a private database is neither granted nor forbidden in writing.
5. The free tier "is intended for evaluating the API", and its limits now appear only in the account [S4]. Until at least August 2026 the published defaults were 25 hits per minute, 250 per day, 1,000 per week and 2,500 per month [S5]. That is about 3 calls per hour across a month.

## Details

### Endpoint for Canada

- The API root is `https://api.adzuna.com/v1/api`, and every call needs the `app_id` and `app_key` query parameters [S2].
- The search path is `/jobs/{country}/search/{page}`. The `country` enum is `gb, us, at, au, be, br, ca, ch, de, es, fr, in, it, mx, nl, nz, pl, sg, za`, so `ca` is valid [S1]. `page` starts at 1 [S1].
- JSON comes back when the `Accept` header is `application/json` or the `content-type=application/json` query parameter is set [S2].
- Errors are HTTP 400 (bad parameters), 404, 410 ("Authorisation failed") and 500 [S1]. The spec documents no 429 or rate-limit headers.

### Query parameters that matter for the ingestion worker

All from the OpenAPI spec [S1] unless noted.

| Parameter | Spec text or values | Use for Toronto and the GTA |
|---|---|---|
| `what`, `what_and`, `what_or`, `what_phrase`, `what_exclude`, `title_only` | Keyword matching; `title_only` matches the title only | `title_only` can target "junior" or "new grad" titles; `what_exclude` can drop "senior" |
| `where` | "Place names, postal codes, etc." | `where=Toronto` |
| `distance` | Kilometres from `where`, "Defaults to 5km" | The 5 km default misses most of the GTA, so the worker must set it (for example 40 to 50) |
| `location0` to `location7` | The `location.area` hierarchy, given in the spec only with a UK example | Could target `Canada`, `Ontario`, `Toronto`. The Canadian values are unverified |
| `max_days_old` | "The age of the oldest advertisment in days that will be returned." | `max_days_old=1` or `2` for hourly polling |
| `sort_by` | `default`, `hybrid`, `date`, `salary`, `relevance` | `sort_by=date` puts the newest first |
| `sort_dir` | `up`, `down` | Down for newest first. Which value is the default is not documented |
| `results_per_page` | Integer, minimum 1. No maximum is documented | See Open questions |
| `category` | A tag from the categories endpoint. The UK example is `it-jobs` [S3] | Probably `it-jobs` for `ca`. Unverified |
| `full_time`, `part_time`, `permanent`, `contract` | `"1"` to filter | Optional |
| `salary_min`, `salary_max`, `salary_include_unknown` | Integers in the local currency | CAD for `ca` |
| `company` | The canonical company name | Not needed |

A legacy page names `results_per_page`, `max_days_old`, `sort_direction` and `sort_by` as the parameters to use for receiving "the data you are expecting" [S6]. The current spec calls the direction parameter `sort_dir` [S1].

### Fields in each result

The `Job` schema [S1] has these fields. `id`, `title`, `description` and `created` are the required ones.

| Field | Spec description | Maps to |
|---|---|---|
| `id` | "A string uniquely identifying the advertisement." | The Sighting's source key |
| `title` | "A summary of the advertisement." | The Posting title |
| `created` | "The date the advertisement was placed, as an ISO 8601 date time string." | The Sighting date, an input to Posted at |
| `company.display_name` | "The name of the company, in the form provided by the advertiser." | Company, before normalising |
| `company.canonical_name` | "A normalised string of the company name." | A deduplication key, if it is present |
| `location.display_name`, `location.area` | A readable name, and an array that narrows at each step (UK example: `["UK","South East England","Buckinghamshire","Marlow"]`) | Location and the GTA filter |
| `latitude`, `longitude` | Workplace coordinates | A distance check |
| `description` | "The details of the advertisement, truncated to 500 characters." | A snippet only |
| `redirect_url` | "A URL that redirects to the advertisement on the advertiser's site. Use this URL to send users to the advertiser's site to comply with Adzuna's terms and conditions." | The Sighting URL |
| `adref` | For re-retrieving the ad through an `ad` endpoint, "to confirm that the advertisement is still current" | No `ad` endpoint appears in the spec |
| `category.label`, `category.tag` | The category | Optional |
| `salary_min`, `salary_max`, `salary_is_predicted` | Local currency. `salary_is_predicted` is `'1'` when Jobsworth estimated it | Keep the flag. A predicted salary is not the employer's figure |
| `contract_time`, `contract_type` | `full_time`/`part_time`, `permanent`/`contract` | Optional |

The search guide says twice: "Please note we currently only provide a snipped of the job description in the response" [S3]. Its examples end the description with "..." [S3]. Fit scoring for a Tier therefore cannot rely on the Adzuna description alone. The full text has to come from the page behind `redirect_url`, or from another Sighting of the same Posting.

The search response also carries `count` (the total number of ads found) and `mean` (the mean salary) [S1].

### redirect_url and the employer's ATS

- The documented examples are `http://adzuna.co.uk/jobs/land/ad/129698749...` and `http://adzuna.co.uk/jobs/land/ad/126977586?v=...&utm_medium=api&utm_source=...` [S3]. The stored URL is an Adzuna landing link with tracking parameters. It is not the ATS URL.
- The spec says the link redirects to "the advertiser's site" [S1]. The docs do not say that the advertiser is the employer. Adzuna is an aggregator, so the final hop may be an ATS, a staffing agency or another job board. This is unverified for `ca` without a key.
- Deduplication into Postings cannot match on the URL. It has to use company, title and location, or the final URL after following the redirect.

### Terms of service

The API terms incorporate Adzuna's general Terms and Conditions [S4].

Permitted use, current text [S4]:

> The Adzuna API may be used for: Personal job search; Publishing Adzuna ad listings; Publishing Jobsworth salary estimates; Personal and academic research. Any other use, including commercial analysis, resale of data, and sales prospecting or lead generation, requires our written agreement.

- "Personal job search" was added between the 2026-08-12 snapshot and the current page. The earlier list had only publishing listings, publishing Jobsworth estimates, and "Personal research" [S5].
- A commercial, government or academic organisation gets a 14-day trial. After it, "for any use in a product or service that generates revenue or leads, a licence agreement is required" [S4]. A single-user tool that earns no revenue is outside this clause.
- The general terms grant "a non-exclusive licence to use and access the services solely for your own use" [S7]. They also forbid using the Services to build "a similar or competitive product or service" [S7].

Storage:

- Neither the current terms [S4] nor the August 2026 snapshot [S5] says anything about storing, caching or retention.
- The only related clause is under Termination: "an API user shall immediately remove all insertion codes and data acquired from Adzuna from all pages of its web sites" [S4]. If access ends, the UI must stop showing Adzuna Sightings.
- The partner terms on the general terms page tell syndication partners to refresh content within 4 hours and to prevent screen-scraping [S7]. Those terms cover Adzuna's paid backfill partners, not ordinary API users. My reading is that they do not apply here.

Attribution [S4]:

- Publishing listings: "label each displayed advert with the phrase "Adzuna" at least 116 X 23 pixels in size", with the word linked to the Adzuna domain for the country (for Canada presumably `adzuna.ca`).
- Personal or academic research: "acknowledge Adzuna as the source of all salary and vacancies data wherever it is published", referring to "The Adzuna API".
- A private UI behind single-user auth arguably publishes nothing. The cheap safe choice is to show an "Adzuna" link on every Adzuna Sighting anyway, and to send clicks through `redirect_url` as the spec asks [S1].

Other clauses that could bite [S4]:

- "Creation of multiple accounts for a single entity or individual will immediately be considered misuse". One key only.
- "Any attempt to contact a third party, even where they provide listings content, will be considered a breach". Read literally, this covers contacting an employer whose ad came through Adzuna. Applying for the job is the whole point of "Personal job search", so the clause most likely targets going around Adzuna to its content providers about data. This reading is mine and is not stated by Adzuna.
- "Adzuna reserves the right to change the Terms of Service at any time." The page changed at least once in the last three months [S4][S5].

### Quotas and the hourly poll

- Current text [S4]: "The free tier is intended for evaluating the API. Paid plans are available for personal and academic use at higher volumes. The plans available to you, and their limits, are shown in your account. We may vary limits from time to time." No number is published.
- Archived text, present from at least January 2025 to 2026-08-12 [S5]: "Default API access limits: 25 hits per minute, 250 hits per day, 1000 hits per week, 2500 hits per month."
- If those defaults still apply, 2,500 hits a month over about 720 hours allows 3 calls per hour. Examples: one query and one page each hour is 720 hits a month. Three queries each hour is 2,160, close to the cap. Paging deeper or adding queries goes over it.
- "Intended for evaluating the API" suggests that long-running hourly polling on the free tier may need a paid personal plan. The price of that plan is not published.

## Open questions

- The current free-tier limits for a new key. They are shown only in the account, which needs signup.
- The maximum `results_per_page`. The spec sets no upper bound. Unverified.
- What `location.area` holds for Toronto in `ca` results (for example `["Canada","Ontario","Toronto"]`), and which `location0`/`location1` values select Ontario or the GTA. Unverified.
- Whether `redirect_url` for `ca` lands on the employer's ATS or on an intermediary board. Test this on real results once a key exists.
- Whether `created` is the employer's posting date or the date Adzuna first indexed the ad. The spec says "placed". If it means indexed, an Adzuna Sighting may look newer than the real Posted at.
- Whether the Canadian `category` tag is `it-jobs`. The categories endpoint for `ca` answers this.
- Whether the HTTP 410 code also covers quota exhaustion. The spec lists no 429.
- The price and limits of the paid personal plan.
- The general terms were read from an archived copy of 2026-10-02 [S7], because the live site returned HTTP 403 to automated requests. The Canadian site's own terms were not read for the same reason.

## Sources

- [S1] Adzuna API OpenAPI spec, the interactive API reference: https://developer.adzuna.com/swagger/spec/test2.json (loaded by https://developer.adzuna.com/activedocs)
- [S2] Adzuna API overview: https://developer.adzuna.com/overview
- [S3] Adzuna API search guide: https://developer.adzuna.com/docs/search
- [S4] Adzuna API Terms of Service, current: https://developer.adzuna.com/docs/terms_of_service
- [S5] Adzuna API Terms of Service, archived 2026-08-12: https://web.archive.org/web/20260812110212/https://developer.adzuna.com/docs/terms_of_service (the same limits text appears in the 2025-01-17 snapshot: https://web.archive.org/web/20250117053639/https://developer.adzuna.com/docs/terms_of_service)
- [S6] Legacy API docs, Search: https://api.adzuna.com/v1/doc/Search.md
- [S7] Adzuna general Terms and Conditions, archived 2026-10-02: https://web.archive.org/web/20261002191352/https://www.adzuna.co.uk/terms-and-conditions.html

# JobSpy from a cloud server

Research for ticket #7. Researched on 2026-10-29 against JobSpy 1.4.1 (PyPI, released 2026-10-23) and `main` at commit `68b88d6`.

## Summary

1. No source shows LinkedIn or Indeed Canada blocking a cloud IP today. Reports from 2025 and October 2026 show Indeed and LinkedIn working from GCP and GitHub Actions (Azure) IPs, while reports from 2023 and 2024 show cloud IPs blocked.
2. Nobody has reported on Fly.io, Railway or Hetzner, or on Canada from any cloud host. Whether our host's IP range is clean is unverified, and only a run from that host can tell.
3. JobSpy has no retry or backoff. A 403 or 429 ends that board's part of the run and shows in `jobs.attrs["errors"]`, so the worker can detect a block and alert on it.
4. Recommendation: run the worker in the cloud, as decided, and keep JobSpy's `proxies` option wired to config. If the host gets blocked, route LinkedIn (or both boards) through a rotating residential proxy instead of moving JobSpy home.
5. Hourly Toronto polling needs roughly 1 GB a month of proxied traffic (an estimate, below), so the proxy costs about USD 3.50 to 7.50 a month at today's smallest pay-per-GB plans.

## What the code does

All file references are to [JobSpy `main` at `68b88d6`](https://github.com/speedyapply/JobSpy/tree/68b88d6909a2342ad75fbb945c4204a3a7ed6665).

### LinkedIn

- Search calls `GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` with `keywords`, `location`, `distance`, `start`, and `f_TPR=r<seconds>` when `hours_old` is set. This is LinkedIn's logged-out (guest) endpoint, and it returns 10 cards a page, up to `start` 1000 ([`jobspy/linkedin/__init__.py`](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/linkedin/__init__.py) lines 65 to 73, 114 to 127; [`constant.py`](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/linkedin/constant.py) lines 5 and 6).
- The client is plain `requests`, with a fixed desktop Chrome 120 user agent and `accept-language: en-US`. Cookies are cleared before every request. There is no TLS fingerprint impersonation for LinkedIn ([`util.py`](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/util.py) lines 63 to 74; `constant.py` lines 9 to 13). JobSpy uses `curl_cffi` with `impersonate="chrome"` only for Glassdoor, Naukri, Bayt and HelloWork (`grep -rn TLSRotating jobspy`).
- Pacing is a random 3 to 7 second sleep between search pages, and nothing else (`__init__.py` lines 47 and 66 to 67).
- `fetch_description=True` makes one extra `GET https://www.linkedin.com/jobs/view/<id>` per job, with no sleep between these requests (`__init__.py` lines 150 to 152, 210 to 216). If LinkedIn redirects that page away from `/jobs/view/`, for example to a sign-in wall, the job keeps its card fields and loses its details, with a warning (lines 220 to 223).
- Block detection works like this. Any non-200 status fails the search, and a 403 or 429 gets the hint "(blocked: use a proxy)" in the error text (`util.py` lines 105 to 108). A 200 page with no job cards that is not LinkedIn's known empty page fails with `unexpected page with no jobs (blocked?)` (`__init__.py` lines 81 to 88).

### Indeed

- Search is `POST https://apis.indeed.com/graphql` with the `jobSearch` query, 100 jobs a page, paged by cursor ([`jobspy/indeed/__init__.py`](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/indeed/__init__.py) lines 40, 64 to 84; [`constant.py`](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/indeed/constant.py) line 3).
- The headers impersonate Indeed's iOS app: an `indeed-api-key`, an `Indeed App 193.1` iPhone user agent and `indeed-app-info`. For Canada it adds `indeed-co: CA` and `indeed-locale: en-CA` (`constant.py` lines 95 to 102; `__init__.py` lines 48 to 56). The client is plain `requests` with no TLS impersonation.
- There is no sleep between pages. The maintainers have said the API key path has no rate limit ([issue #112](https://github.com/speedyapply/JobSpy/issues/112)), and a maintainer said in 2024 that the key is Indeed's public site-wide key (unverified).
- `hours_old` becomes a server-side filter on `dateOnIndeed` with an hour granularity (`start: "<n>h"`) (`__init__.py` lines 132 to 135).
- Descriptions come back inside the search response, so `fetch_description` is ignored for Indeed and costs nothing (`grep -rln fetch_description jobspy` lists no Indeed file).

### Shared behaviour

- No board has retry or backoff (`grep -rn -iE 'Retry|backoff' jobspy` returns nothing). The 2024 LinkedIn retry config mentioned in [issue #129](https://github.com/speedyapply/JobSpy/issues/129) is gone.
- Each request has a 15 second timeout (`util.py` line 38). Boards run in parallel threads (`jobspy/__init__.py` line 121).
- `proxies` takes a list of `user:pass@host:port` strings, and each board's session round-robins through them per request. `"localhost"` in the list means a direct connection. SOCKS proxies need `requests[socks]` ([README](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/README.md), `proxies`; `util.py` lines 37 to 60).
- Errors and warnings land in `jobs.attrs["errors"]` and `jobs.attrs["warnings"]`, keyed by board (README FAQ "How do I tell a blocked board from one with no jobs?").

### What the README says about blocking

- The 1.4.1 README says "Indeed is the best scraper currently with no rate limiting" and "LinkedIn rate limits bursts of requests with a 429, which clears within about a minute. Use proxies for larger searches." Its FAQ adds "All of the job board sites are aggressive with blocking" and recommends waiting between scrapes and using proxies ([README](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/README.md), Notes and FAQ).
- The 1.1.82 README (September 2026) was harsher: "LinkedIn is the most restrictive and usually rate limits around the 10th page with one ip. Proxies are a must basically." (`curl -s https://pypi.org/pypi/python-jobspy/1.1.82/json`, field `info.description`).
- The MCP server's README says "Job boards block repeated searches" and suggests `HTTPS_PROXY` ([mcp/README.md](https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/mcp/README.md), Proxies).

## What the issues say about cloud IPs

Every report found, oldest first. GitHub search for Railway, Hetzner, Fly.io, Heroku, Lambda, Cloud Run and VPS found no reports on those hosts.

| Date | Host | Boards | Outcome | Source |
|---|---|---|---|---|
| 2023-09 | Oracle Cloud free tier, AWS Lightsail | Indeed, LinkedIn, ZipRecruiter | Indeed worked. LinkedIn and ZipRecruiter hit Cloudflare CAPTCHA. A "better proxy" fixed it. | [#37](https://github.com/speedyapply/JobSpy/issues/37) |
| 2023-12 | Unstated | Indeed USA | Instant 403. A maintainer asked whether the IP was "of quality". | [#74](https://github.com/speedyapply/JobSpy/issues/74) |
| 2024-01 | Unstated | Indeed | 403. A maintainer said to try a different IP. | [#83](https://github.com/speedyapply/JobSpy/issues/83) |
| 2024-02 | Render, Azure | Indeed | Hung or returned nothing. A maintainer said "Indeed has banned a lot of the cloud providers ip's. You need to put a proxy on it," and that his own site runs on DigitalOcean with no issues. | [#93](https://github.com/speedyapply/JobSpy/issues/93) |
| 2024-08 | AWS EC2 (suggested) | ZipRecruiter | A user suggested EC2 to get around ZipRecruiter's EU geoblock, which implies EC2 worked for them. | [#190](https://github.com/speedyapply/JobSpy/issues/190) |
| 2025-02 | Google Cloud Functions | Indeed, LinkedIn, ZipRecruiter, Glassdoor | "passing in 'indeed' or 'linkedin' for site_name works fine when run on GCP". ZipRecruiter and Glassdoor hung. | [#249](https://github.com/speedyapply/JobSpy/issues/249) |
| 2026-09 and 10 | GitHub Actions `ubuntu-latest` (Azure) | Indeed Germany, and LinkedIn | On 1.2.0, "150 results in 2.8 s across two POST /graphql requests". The reporter says LinkedIn showed the same hang shape on 1.1.82, so LinkedIn was reachable from that runner. | [#385](https://github.com/speedyapply/JobSpy/issues/385) |

Other relevant threads:

- [#112](https://github.com/speedyapply/JobSpy/issues/112) (2024): a maintainer closed a rate-limiter request because "increasing the delay still results in being blocked" on LinkedIn.
- [#144](https://github.com/speedyapply/JobSpy/issues/144) (2024): a maintainer said "we get 429 quickly with jobs search page".
- [#287](https://github.com/speedyapply/JobSpy/issues/287) (2025, closed 2026-09): connection errors to `apis.indeed.com`. A maintainer said "Indeed works today" and named IP blocking as one possible cause.
- [#258](https://github.com/speedyapply/JobSpy/issues/258) (2026-10): LinkedIn's logged-out search stops at about 1,000 results per search.

The pattern is that blocks depend on the IP's reputation and on burst volume more than on "cloud or not". The two newest first-hand reports from cloud IPs both worked for Indeed and LinkedIn. None of these reports used Canada.

## Our own run

This machine has a residential IP, so this run shows the fields JobSpy returns. It says nothing about cloud blocking.

```sh
python3 -m venv .../scratchpad/jobspy-venv
.../scratchpad/jobspy-venv/bin/pip install python-jobspy==1.4.1   # curl_cffi 0.17.0, requests 2.34.2
```

```python
scrape_jobs(
    site_name=["indeed", "linkedin"],
    search_term="junior software developer",
    location="Toronto, ON",
    country_indeed="Canada",
    results_wanted=10,
    hours_old=72,
    fetch_description=True,
    verbose=2,
)
```

Run on 2026-10-29 at 17:01 EDT. Both boards returned 10 rows with no errors or warnings. Indeed took one POST and finished in 0.6 s. LinkedIn took one search page plus 10 job pages and finished in 8.1 s. One job page fetched again with `curl --compressed` was 32,689 bytes of body plus 5,429 bytes of headers.

### Fields

| Field | Indeed (10 rows) | LinkedIn (10 rows, with `fetch_description`) |
|---|---|---|
| `date_posted` | 10/10. A `date`, no time. It is the UTC date of `dateOnIndeed` (`util.py` `utc_date`; `indeed/__init__.py` line 187). | 10/10. A `date`, no time, from the card's `<time datetime>` attribute (`linkedin/__init__.py` lines 143 to 149). Its timezone is unverified. |
| `description` | 10/10, Markdown, 2,768 to 8,561 characters, median 6,657 | 10/10, Markdown, 3,098 to 9,793 characters, median 6,373. Empty without `fetch_description` ([#374](https://github.com/speedyapply/JobSpy/issues/374)). |
| `job_url_direct` | 9/10. Null when the apply URL is on indeed.com (`indeed/__init__.py` lines 171 to 173). | 0/10. LinkedIn no longer shows the external apply URL to logged-out visitors, and JobSpy removed the parser ([#370](https://github.com/speedyapply/JobSpy/issues/370)). |
| `company` | 10/10 | 10/10 |
| `location` | 10/10, `City, ON, Canada` from city and `admin1Code` | 10/10, `Toronto, Ontario, Canada` from the card text |
| `is_remote` | 10/10 (all false). True when Indeed's remote attribute is set and its hybrid attribute is not (`indeed/util.py` `is_job_remote`). | 10/10 (all false). A keyword guess: "remote", "work from home" or "wfh" in the title or location (`linkedin/util.py` `is_job_remote`). LinkedIn hides the workplace type from logged-out visitors ([#248](https://github.com/speedyapply/JobSpy/issues/248)), and the `is_remote` search filter is ignored with a warning. |
| `job_type` | 7/10 | 10/10 |
| `job_level` | 0/10 | 10/10, for example "entry level" |
| Salary (`min_amount` etc.) | 9/10, CAD | 0/10 |

Neither board gives the Work arrangement as a field. Both descriptions in the sample below carry "Work Model: Hybrid" in their text, so the Work arrangement has to come from the description.

Three of the ten Postings appeared on both boards (same company and title). In the sample below, one Posting has a LinkedIn Sighting dated 2026-10-28 and an Indeed Sighting dated 2026-10-29.

### Trimmed sample rows

```json
{"site": "indeed", "id": "in-9ed1c4e22c77bcfb", "title": "Junior Software Engineer",
 "company": "Deloitte", "location": "Toronto, ON, Canada", "date_posted": "2026-10-29",
 "is_remote": false, "job_type": null, "interval": "yearly", "min_amount": 58000.0,
 "max_amount": 96000.0, "currency": "CAD", "salary_source": "direct_data",
 "job_url": "https://ca.indeed.com/viewjob?jk=9ed1c4e22c77bcfb",
 "job_url_direct": "https://careers.deloitte.ca/job/Junior-Software-Engineer/133892-en_US",
 "description": "**Job Type:** Permanent   **Work Model:** Hybrid   **Reference code:** 133892 ..."}
{"site": "linkedin", "id": "li-4484496029", "title": "Junior Software Engineer",
 "company": "Deloitte", "location": "Toronto, Ontario, Canada", "date_posted": "2026-10-28",
 "is_remote": false, "job_type": "fulltime", "job_level": "not applicable", "min_amount": null,
 "job_url": "https://www.linkedin.com/jobs/view/4484496029", "job_url_direct": null,
 "company_industry": "Accounting, IT Services and IT Consulting, and Business Consulting and Services",
 "description": "**Job Type:** Permanent **Work Model:** Hybrid **Reference code:** 133892 ..."}
```

### What this means for Posted at

Both boards give a date with no time, so a Sighting's own date is day-precise. The `hours_old` filter is hour-precise on both boards, so hourly polling with `hours_old=2` returns only recent Postings. Hour precision for Posted at would have to come from the time the worker first sees a Sighting. Indeed's date is a UTC date, so a Posting added after 20:00 EDT carries the next day's date. A fork PR that kept Indeed's full timestamp and LinkedIn's "3 hours ago" text was opened upstream by mistake and closed, not merged ([#373](https://github.com/speedyapply/JobSpy/pull/373)).

## The cost of `fetch_description`

- `linkedin_fetch_description` is deprecated since 1.2.0 and is now an alias for `fetch_description`. It still works and goes away in 2.0 (`jobspy/model.py` lines 257 to 259, 277 to 279; README).
- On Indeed it costs nothing, because descriptions arrive with the search.
- On LinkedIn it costs one GET of about 33 KB compressed (38 KB with headers) per job, fired back to back with no delay. Ten jobs took about 7 seconds on our run. Without it, LinkedIn rows lack the description, `job_type`, `job_level`, `job_function`, `company_industry` and salary.
- It is the main burst risk on LinkedIn, because the README says LinkedIn answers bursts with a 429. JobSpy has no way to fetch details for only the new Postings. It re-fetches every job a search returns, and an open request for a page cache has no code yet ([#441](https://github.com/speedyapply/JobSpy/issues/441)). A small `hours_old` window keeps the count of re-fetched jobs low.

## Proxy cost estimate

The traffic estimate is ours, not measured over time. It assumes three search terms an hour on each board with `hours_old=2`, and about 20 new LinkedIn Postings an hour across them.

- LinkedIn: 3 terms at 1 to 2 search pages of about 8 KB each, plus 20 job pages at 38 KB, is about 0.8 MB an hour.
- Indeed: 3 GraphQL POSTs. Their size is not measured. At 100 jobs with descriptions of about 6.5 KB each, a page is roughly 0.6 MB before compression and perhaps 0.15 to 0.25 MB gzipped (unverified).
- Total: about 1.5 MB an hour, or about 1.1 GB a month. Proxying only LinkedIn is about 0.6 GB a month.

Prices checked on 2026-10-29:

| Provider | Product | Price |
|---|---|---|
| Webshare | Rotating residential | USD 3.50/GB on the 1 GB plan ([pricing](https://www.webshare.io/pricing)) |
| Webshare | Static residential (ISP) | USD 6 a month for 20 IPs ([pricing](https://www.webshare.io/pricing)) |
| Webshare | Datacenter | USD 2.99 a month for 100 IPs, or a free plan with 10 ([pricing](https://www.webshare.io/pricing)) |
| IPRoyal | Rotating residential | USD 7.35/GB pay as you go for 1 GB, and the traffic does not expire ([pricing](https://iproyal.com/pricing/residential-proxies/)) |

A datacenter proxy is cheapest but has the same kind of IP reputation as the cloud host, so it likely fails the same way (an inference, untested). Rotating residential at 1 to 2 GB a month is about USD 3.50 to 15 a month. Static ISP IPs are a flat USD 6 a month, and their success on LinkedIn and Indeed is untested.

## Why not the home machine

A home machine works today (our run). It brings back the problems the cloud decision exists to avoid: the Mac sleeps, and the Windows home server was rejected ([app-runs-in-the-cloud](../kb/decisions/app-runs-in-the-cloud.md)). A proxy costs a few dollars a month and keeps the single Docker Compose deploy. Keep the home machine as the last fallback, if both the cloud IP and a residential proxy get blocked.

## Open questions

- Does our chosen cloud host's IP reach `www.linkedin.com/jobs-guest` and `apis.indeed.com` from Canada searches? One run of the command above from the host answers this. A week of hourly polling with `jobs.attrs["errors"]` logged answers whether it lasts.
- Does LinkedIn's 429 window ("clears within about a minute", README) hold for a datacenter IP, or is a datacenter IP sent to the sign-in wall instead? Unverified.
- The actual size of an Indeed GraphQL page of 100 jobs, which sets the proxy traffic. Not measured.
- The timezone of LinkedIn's `<time datetime>` date. Not verified.
- Whether a static ISP proxy is enough for LinkedIn, which would make the cost a flat monthly fee. Untested.
- Whether the shared Indeed iOS API key gets revoked or rate-limited per key. If it does, every JobSpy user is affected at once, whatever the IP ([#112](https://github.com/speedyapply/JobSpy/issues/112)).

## Sources

- JobSpy repository, `main` at `68b88d6`: https://github.com/speedyapply/JobSpy/tree/68b88d6909a2342ad75fbb945c4204a3a7ed6665
- JobSpy README: https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/README.md
- JobSpy MCP README: https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/mcp/README.md
- LinkedIn scraper: https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/linkedin/__init__.py
- Indeed scraper: https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/indeed/__init__.py
- Shared sessions and status checks: https://github.com/speedyapply/JobSpy/blob/68b88d6909a2342ad75fbb945c4204a3a7ed6665/jobspy/util.py
- JobSpy releases (1.4.1 on 2026-10-23): https://github.com/speedyapply/JobSpy/releases
- 1.1.82 README on PyPI: https://pypi.org/pypi/python-jobspy/1.1.82/json
- Issues: [#37](https://github.com/speedyapply/JobSpy/issues/37), [#74](https://github.com/speedyapply/JobSpy/issues/74), [#83](https://github.com/speedyapply/JobSpy/issues/83), [#93](https://github.com/speedyapply/JobSpy/issues/93), [#112](https://github.com/speedyapply/JobSpy/issues/112), [#129](https://github.com/speedyapply/JobSpy/issues/129), [#144](https://github.com/speedyapply/JobSpy/issues/144), [#190](https://github.com/speedyapply/JobSpy/issues/190), [#248](https://github.com/speedyapply/JobSpy/issues/248), [#249](https://github.com/speedyapply/JobSpy/issues/249), [#258](https://github.com/speedyapply/JobSpy/issues/258), [#287](https://github.com/speedyapply/JobSpy/issues/287), [#370](https://github.com/speedyapply/JobSpy/issues/370), [#374](https://github.com/speedyapply/JobSpy/issues/374), [#385](https://github.com/speedyapply/JobSpy/issues/385), [#441](https://github.com/speedyapply/JobSpy/issues/441)
- PR [#373](https://github.com/speedyapply/JobSpy/pull/373)
- Webshare pricing: https://www.webshare.io/pricing
- IPRoyal residential pricing: https://iproyal.com/pricing/residential-proxies/
- Issue searches: `gh search issues --repo speedyapply/JobSpy "<term>"` for aws, gcp, azure, railway, hetzner, fly.io, digitalocean, heroku, render, vps, docker, lambda, ec2, cloud run, oracle, datacenter, residential, proxies, blocked, 429, canada

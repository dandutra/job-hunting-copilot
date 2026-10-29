---
title: Watched companies in Toronto
description: Toronto and GTA employers in our Role families, with the ATS and board slug of each, for loading as Watched companies.
ticket: 3
researched: 2026-10-29
---

# Watched companies in Toronto

## Summary

1. The list has 99 Toronto and GTA employers. For 86 of them, the ATS and board were confirmed on 2026-10-29 from the company's careers page or from the board's public endpoint.
2. Of those, 63 can be polled today through a public JSON endpoint: Greenhouse 20, Workday 19, Ashby 13, Lever 10 and SmartRecruiters 1.
3. Banks, insurers and pension funds mostly run Workday (RBC, TD, BMO, CIBC, Manulife, Sun Life, Aviva, OMERS, OTPP, CPP Investments, CAAT). Startups, scale-ups and US tech companies with Toronto offices mostly run Greenhouse, Ashby or Lever.
4. Scotiabank, Canada Life, IG Wealth, Rogers, TELUS, the utilities and the public agencies run SAP SuccessFactors (14 companies), which has no public JSON board API. The Ontario Public Service, TTC, Vaughan and Halton Hills run their own or unidentified portals.
5. No company on the list uses Taleo. WSP and Metrolinx use Oracle Recruiting Cloud, Taleo's successor, which does answer a public REST call.

## Method

- The list starts from the past co-op targets (banks, pension funds, insurers, the Ontario Public Service, utilities, a few tech companies). It then adds Toronto startups, scale-ups and big-tech Toronto offices that hire into the Role families (full-stack, back-end, front-end, cloud/ops, support).
- For Greenhouse, Lever, Ashby and SmartRecruiters, a row is verified when the board endpoint returned HTTP 200 with the company's own board. For Workday, a row is verified when the career-site endpoint (`POST /wday/cxs/<tenant>/<site>/jobs`) returned a job total.
- For the other systems, a row is verified when the company's own careers page links to, or loads assets from, that ATS host.
- Slugs came from links on careers pages where possible and from trial guesses otherwise. A guess only counts when the endpoint returned that company's board. Requests were sent one at a time, at least one second apart.
- The note column gives the board's counts on 2026-10-29. "GTA" counts postings whose location names Toronto, Mississauga, Markham, Vaughan, Oakville, Brampton, Richmond Hill, North York, Etobicoke or Scarborough. "Canada" also counts postings that name Canada or Ontario. "Junior-looking titles" counts Canada postings whose title matches new grad, graduate, junior, entry, intern, co-op, "Engineer I" or "Associate Software/Developer/Engineer". For Workday, "match 'Toronto'" is the board's full-text search hit count, not a location filter, so it overcounts.

## Watched companies

| Company | Sector | ATS | Board slug or tenant URL | Verified | Note |
|---|---|---|---|---|---|
| Ada | AI customer service | greenhouse | [`ada18`](https://job-boards.greenhouse.io/ada18) | yes | 7 jobs, 0 GTA, 5 Canada, 0 junior-looking titles in Canada. Remote - Canada |
| Block | Payments | greenhouse | [`block`](https://job-boards.greenhouse.io/block) | yes | 203 jobs, 12 GTA, 14 Canada, 1 junior-looking titles in Canada |
| Coursera | Ed tech | greenhouse | [`coursera`](https://job-boards.greenhouse.io/coursera) | yes | 30 jobs, 3 GTA, 4 Canada, 0 junior-looking titles in Canada |
| D2L | Ed tech | greenhouse | [`d2l`](https://job-boards.greenhouse.io/d2l) | yes | 21 jobs, 8 GTA, 16 Canada, 0 junior-looking titles in Canada. Kitchener HQ, Toronto roles |
| Databricks | Data platform | greenhouse | [`databricks`](https://job-boards.greenhouse.io/databricks) | yes | 906 jobs, 11 GTA, 26 Canada, 2 junior-looking titles in Canada |
| Faire | Marketplace | greenhouse | [`faire`](https://job-boards.greenhouse.io/faire) | yes | 67 jobs, 13 GTA, 14 Canada, 0 junior-looking titles in Canada |
| Geotab | Telematics | greenhouse | [`geotab`](https://job-boards.greenhouse.io/geotab) | yes | 61 jobs, 13 GTA, 16 Canada, 0 junior-looking titles in Canada. Oakville HQ |
| Instacart | Big tech | greenhouse | [`instacart`](https://job-boards.greenhouse.io/instacart) | yes | 93 jobs, 0 GTA, 34 Canada, 0 junior-looking titles in Canada. Canada - Remote (ON allowed) |
| Konrad | Software agency | greenhouse | [`konradgroup`](https://job-boards.greenhouse.io/konradgroup) | yes | 106 jobs, 42 GTA, 42 Canada, 3 junior-looking titles in Canada. Toronto HQ |
| League | Health tech | greenhouse | [`leagueinc`](https://job-boards.greenhouse.io/leagueinc) | yes | 5 jobs, 3 GTA, 4 Canada, 0 junior-looking titles in Canada |
| Lyft | Big tech | greenhouse | [`lyft`](https://job-boards.greenhouse.io/lyft) | yes | 179 jobs, 49 GTA, 73 Canada, 12 junior-looking titles in Canada |
| Mercury | Fintech | greenhouse | [`mercury`](https://job-boards.greenhouse.io/mercury) | yes | 78 jobs, 0 GTA, 60 Canada, 0 junior-looking titles in Canada. Remote within Canada |
| Okta | Identity | greenhouse | [`okta`](https://job-boards.greenhouse.io/okta) | yes | 387 jobs, 73 GTA, 73 Canada, 0 junior-looking titles in Canada |
| PagerDuty | Developer tools | greenhouse | [`pagerduty`](https://job-boards.greenhouse.io/pagerduty) | yes | 49 jobs, 7 GTA, 7 Canada, 0 junior-looking titles in Canada |
| Pinterest | Big tech | greenhouse | [`pinterest`](https://job-boards.greenhouse.io/pinterest) | yes | 165 jobs, 12 GTA, 12 Canada, 2 junior-looking titles in Canada |
| Robinhood | Fintech | greenhouse | [`robinhood`](https://job-boards.greenhouse.io/robinhood) | yes | 167 jobs, 19 GTA, 19 Canada, 2 junior-looking titles in Canada |
| StackAdapt | Ad tech | greenhouse | [`stackadapt`](https://job-boards.greenhouse.io/stackadapt) | yes | 75 jobs, 6 GTA, 41 Canada, 1 junior-looking titles in Canada |
| Stripe | Payments | greenhouse | [`stripe`](https://job-boards.greenhouse.io/stripe) | yes | 732 jobs, 43 GTA, 60 Canada, 7 junior-looking titles in Canada |
| Tailscale | Networking | greenhouse | [`tailscale`](https://job-boards.greenhouse.io/tailscale) | yes | 52 jobs, 2 GTA, 21 Canada, 0 junior-looking titles in Canada |
| Tenstorrent | AI hardware | greenhouse | [`tenstorrent`](https://job-boards.greenhouse.io/tenstorrent) | yes | 122 jobs, 37 GTA, 37 Canada, 0 junior-looking titles in Canada |
| Achievers | HR tech | lever | [`achievers`](https://jobs.lever.co/achievers) | yes | 15 jobs, 11 GTA, 13 Canada, 0 junior-looking titles in Canada |
| EQ Bank | Bank | lever | [`eqbank`](https://jobs.lever.co/eqbank) | yes | 83 jobs, 80 GTA, 80 Canada, 19 junior-looking titles in Canada |
| Magnet Forensics | Security software | lever | [`magnetforensics`](https://jobs.lever.co/magnetforensics) | yes | 40 jobs, 7 GTA, 19 Canada, 2 junior-looking titles in Canada. Waterloo HQ, Toronto roles |
| Maple | Health tech | lever | [`getmaple`](https://jobs.lever.co/getmaple) | yes | 14 jobs, 14 GTA, 14 Canada, 0 junior-looking titles in Canada |
| PointClickCare | Health tech | lever | [`pointclickcare`](https://jobs.lever.co/pointclickcare) | yes | 72 jobs, 39 GTA, 43 Canada, 1 junior-looking titles in Canada. Mississauga HQ |
| PolicyMe | Insurtech | lever | [`policyme`](https://jobs.lever.co/policyme) | yes | 10 jobs, 2 GTA, 8 Canada, 1 junior-looking titles in Canada |
| Spotify | Big tech | lever | [`spotify`](https://jobs.lever.co/spotify) | yes | 89 jobs, 2 GTA, 2 Canada, 0 junior-looking titles in Canada |
| Waabi | Autonomous vehicles | lever | [`waabi`](https://jobs.lever.co/waabi) | yes | 94 jobs, 52 GTA, 57 Canada, 3 junior-looking titles in Canada |
| Wattpad | Media tech | lever | [`wattpad`](https://jobs.lever.co/wattpad) | yes | 16 jobs, 2 GTA, 2 Canada, 0 junior-looking titles in Canada. Board shared with WEBTOON |
| Wave | Fintech | lever | [`waveapps`](https://jobs.lever.co/waveapps) | yes | 8 jobs, 2 GTA, 8 Canada, 0 junior-looking titles in Canada |
| 1Password | Security software | ashby | [`1password`](https://jobs.ashbyhq.com/1password) | yes | 90 jobs, 6 GTA, 65 Canada, 11 junior-looking titles in Canada |
| Clearco | Fintech | ashby | [`clearco`](https://jobs.ashbyhq.com/clearco) | yes | 5 jobs, 2 GTA, 5 Canada, 0 junior-looking titles in Canada |
| Cohere | AI | ashby | [`cohere`](https://jobs.ashbyhq.com/cohere) | yes | 121 jobs, 59 GTA, 74 Canada, 5 junior-looking titles in Canada |
| Float | Fintech | ashby | [`float`](https://jobs.ashbyhq.com/float) | yes | 20 jobs, 18 GTA, 20 Canada, 0 junior-looking titles in Canada |
| Hopper | Travel tech | ashby | [`hopper`](https://jobs.ashbyhq.com/hopper) | yes | 18 jobs, 3 GTA, 5 Canada, 0 junior-looking titles in Canada |
| Jobber | SaaS | ashby | [`jobber`](https://jobs.ashbyhq.com/jobber) | yes | 40 jobs, 32 GTA, 32 Canada, 0 junior-looking titles in Canada. Edmonton HQ, Toronto office |
| KOHO | Fintech | ashby | [`koho`](https://jobs.ashbyhq.com/koho) | yes | 9 jobs, 0 GTA, 0 Canada, 0 junior-looking titles in Canada. Location field reads 'KOHO (CAN)' |
| PAR Technology | Restaurant tech | ashby | [`PAR%20Technology`](https://jobs.ashbyhq.com/PAR%20Technology) | yes | 40 jobs, 1 GTA, 2 Canada, 0 junior-looking titles in Canada. Slug has a space, URL-encoded |
| Sentry | Developer tools | ashby | [`sentry`](https://jobs.ashbyhq.com/sentry) | yes | 42 jobs, 9 GTA, 9 Canada, 0 junior-looking titles in Canada |
| Shopify | Commerce platform | ashby | [`(not found)`](https://www.shopify.com/careers) | no | Careers page uses ashby_jid links; board slug not found |
| Snowflake | Data platform | ashby | [`snowflake`](https://jobs.ashbyhq.com/snowflake) | yes | 360 jobs, 8 GTA, 8 Canada, 0 junior-looking titles in Canada |
| Super.com | Consumer tech | ashby | [`super.com`](https://jobs.ashbyhq.com/super.com) | yes | 17 jobs, 0 GTA, 16 Canada, 1 junior-looking titles in Canada |
| Top Hat | Ed tech | ashby | [`top-hat`](https://jobs.ashbyhq.com/top-hat) | yes | 6 jobs, 0 GTA, 4 Canada, 0 junior-looking titles in Canada. Location field is not city-level |
| Wealthsimple | Fintech | ashby | [`wealthsimple`](https://jobs.ashbyhq.com/wealthsimple) | yes | 40 jobs, 3 GTA, 40 Canada, 2 junior-looking titles in Canada |
| Ubisoft | Games | smartrecruiters | [`Ubisoft2`](https://careers.smartrecruiters.com/Ubisoft2) | yes | 124 Canada jobs, 2 GTA in first 100. SmartRecruiters company id; Canada count, mostly Quebec |
| Aviva Canada | Insurer | workday | [`aviva/External`](https://aviva.wd1.myworkdayjobs.com/External) | yes | 139 jobs, 27 match 'Toronto'. Global board; filter to Canada |
| BMO | Bank | workday | [`bmo/External`](https://bmo.wd3.myworkdayjobs.com/External) | yes | 1053 jobs, 272 match 'Toronto' |
| CAAT Pension Plan | Pension fund | workday | [`caatpension/Careers`](https://caatpension.wd10.myworkdayjobs.com/Careers) | yes | 16 jobs, 16 match 'Toronto' |
| Candescent | Fintech | workday | [`candescent/Hiring`](https://candescent.wd501.myworkdayjobs.com/Hiring) | yes | 27 jobs, 0 match 'Toronto'. 0 Toronto hits on probe date |
| CIBC | Bank | workday | [`cibc/search`](https://cibc.wd3.myworkdayjobs.com/search) | yes | 673 jobs, 205 match 'Toronto' |
| CPP Investments | Pension fund | workday | [`cppib/CPPInvestments`](https://cppib.wd10.myworkdayjobs.com/CPPInvestments) | yes | 55 jobs, 46 match 'Toronto'. Site name found by trial; board answered |
| Interac | Payments | workday | [`interac/Interac`](https://interac.wd3.myworkdayjobs.com/Interac) | yes | 51 jobs, 50 match 'Toronto' |
| Loblaw (Loblaw Digital) | Retail | workday | [`myview/loblaw_careers`](https://myview.wd3.myworkdayjobs.com/loblaw_careers) | no | Board answered with 0 jobs; site name is a guess |
| Manulife | Insurer | workday | [`manulife/MFCJH_Jobs`](https://manulife.wd3.myworkdayjobs.com/MFCJH_Jobs) | yes | 624 jobs, 142 match 'Toronto' |
| Nvidia | Semiconductors | workday | [`nvidia/NVIDIAExternalCareerSite`](https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite) | yes | 2000 jobs, 11 match 'Toronto'. API caps total at 2000 |
| OMERS | Pension fund | workday | [`omers/OMERS_External`](https://omers.wd3.myworkdayjobs.com/OMERS_External) | yes | 69 jobs, 61 match 'Toronto'. careers.omers.com is a Phenom front end over this board |
| Ontario Teachers' Pension Plan | Pension fund | workday | [`otppb/OntarioTeachers_Careers`](https://otppb.wd3.myworkdayjobs.com/OntarioTeachers_Careers) | yes | 35 jobs, 33 match 'Toronto' |
| RBC | Bank | workday | [`rbc/RBCGLOBAL1`](https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1) | yes | 852 jobs, 222 match 'Toronto' |
| Salesforce | Big tech | workday | [`salesforce/External_Career_Site`](https://salesforce.wd12.myworkdayjobs.com/External_Career_Site) | yes | 1575 jobs, 40 match 'Toronto' |
| Sun Life | Insurer | workday | [`sunlife/Experienced-Jobs`](https://sunlife.wd3.myworkdayjobs.com/Experienced-Jobs) | yes | 302 jobs, 69 match 'Toronto'. No separate University-Jobs site found |
| TD Bank | Bank | workday | [`td/TD_Bank_Careers`](https://td.wd3.myworkdayjobs.com/TD_Bank_Careers) | yes | 1832 jobs, 1027 match 'Toronto' |
| TELUS Health | Health tech | workday | [`lifeworks/External`](https://lifeworks.wd3.myworkdayjobs.com/External) | yes | 146 jobs, 41 match 'Toronto'. Tenant still named lifeworks |
| Thomson Reuters | Information services | workday | [`thomsonreuters/External_Career_Site`](https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site) | yes | 490 jobs, 75 match 'Toronto' |
| TMX Group | Capital markets | workday | [`tmx/TMX_Careers`](https://tmx.wd3.myworkdayjobs.com/TMX_Careers) | yes | 91 jobs, 91 match 'Toronto' |
| Workday | Enterprise software | workday | [`workday/Workday`](https://workday.wd5.myworkdayjobs.com/Workday) | yes | 397 jobs, 7 match 'Toronto' |
| Canada Life | Insurer | successfactors | [`thegreatweP2`](https://jobs.canadalife.com/) | yes | Careers page links career5.successfactors.eu |
| Celestica | Electronics | successfactors | [`careers.celestica.com`](https://careers.celestica.com/) | yes |  |
| City of Toronto | Municipal | successfactors | [`jobs.toronto.ca`](https://jobs.toronto.ca/) | yes |  |
| Hydro One | Utility | successfactors | [`jobs.hydroone.com`](https://jobs.hydroone.com/) | yes |  |
| IESO | Public agency | successfactors | [`careers.ieso.ca`](https://careers.ieso.ca/) | yes |  |
| IGM Financial (IG Wealth Management) | Wealth management | successfactors | [`investorsgP`](https://career17.sapsf.com/career?company=investorsgP) | yes | Mackenzie Investments page returned 403 |
| MPAC | Public agency | successfactors | [`careers.mpac.ca`](https://careers.mpac.ca/) | yes |  |
| Ontario Power Generation | Utility | successfactors | [`jobs.opg.com`](https://jobs.opg.com/) | yes | Page loads sapsf.com assets |
| Rogers | Telecom | successfactors | [`jobs.rogers.com`](https://jobs.rogers.com/) | yes |  |
| Scotiabank | Bank | successfactors | [`jobs.scotiabank.com`](https://jobs.scotiabank.com/) | yes | Career site links career17.sapsf.com |
| Teck | Mining | successfactors | [`teck.com/careers`](https://www.teck.com/careers/) | yes | Vancouver HQ, Toronto office |
| TELUS | Telecom | successfactors | [`careers.telus.com`](https://careers.telus.com/) | yes |  |
| Toronto Hydro | Utility | successfactors | [`jobs.torontohydro.com`](https://jobs.torontohydro.com/) | yes |  |
| University of Toronto | Education | successfactors | [`jobs.utoronto.ca`](https://jobs.utoronto.ca/) | yes |  |
| Metrolinx | Transit | oracle-recruiting | [`ehtc.fa.ca2/CX_1`](https://ehtc.fa.ca2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1) | yes | Oracle REST answered: 55 'Toronto' hits |
| WSP | Engineering | oracle-recruiting | [`emit.fa.ca3/CX_2001`](https://emit.fa.ca3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2001) | yes | Oracle REST answered: 33 'Toronto' hits |
| Alectra | Utility | dayforce | [`alectra/CANDIDATEPORTAL`](https://jobs.dayforcehcm.com/en-US/alectra/CANDIDATEPORTAL) | yes | Linked from alectra.com/careers |
| Questrade | Fintech | dayforce | [`qfg/CANDIDATEPORTAL`](https://jobs.dayforcehcm.com/qfg/CANDIDATEPORTAL) | yes | Linked from questrade.com careers |
| Empire Life | Insurer | adp | [`cid=1813b5f5-505e-4c90-9c6f-49f292293ac6`](https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=1813b5f5-505e-4c90-9c6f-49f292293ac6&lang=en_CA) | yes | ADP Workforce Now, linked from empire.ca careers |
| First Capital REIT | Real estate | jobvite | [`fcr`](https://jobs.jobvite.com/fcr) | yes | Linked from fcr.ca/careers |
| AMD | Semiconductors | icims | [`careers-amd.icims.com`](https://careers.amd.com/careers-home/jobs) | yes | Markham office |
| Microsoft | Big tech | eightfold | [`apply.careers.microsoft.com`](https://apply.careers.microsoft.com/careers) | yes | Careers search redirects to an Eightfold site |
| Bell | Telecom | phenom | [`jobs.bell.ca`](https://jobs.bell.ca/ca/en) | no | Phenom front end; ATS behind it not identified |
| OpenText | Software | phenom | [`careers.opentext.com`](https://careers.opentext.com/us/en) | no | Phenom front end; ATS behind it not identified |
| Amazon | Big tech | custom | [`amazon.jobs`](https://www.amazon.jobs/) | yes | search.json answered; loc_query filter did not narrow |
| Google | Big tech | custom | [`google.com/about/careers`](https://www.google.com/about/careers/applications/jobs/results/?location=Toronto) | no | Own system; nothing to poll found |
| Meta | Big tech | custom | [`metacareers.com`](https://www.metacareers.com/jobs) | no | No response to a plain request |
| Ontario Public Service | Government | custom | [`gojobs.gov.on.ca`](https://www.gojobs.gov.on.ca/Jobs.aspx) | no | Covers the ministries; bot check blocked the fetch |
| Town of Halton Hills | Municipal | custom | [`haltonhills.ca/jobs`](https://www.haltonhills.ca/careers) | no | Own upload form; page returned 403 |
| Uber | Big tech | custom | [`uber.com/careers`](https://www.uber.com/ca/en/careers/list/) | no | Returned 406 to a plain request |
| Advanced Utility Systems | Utility software | unknown | [`(not found)`](https://www.advancedutility.com/) | no | Careers page returned 404 |
| City of Vaughan | Municipal | unknown | [`(not found)`](https://www.vaughan.ca/about-city-vaughan/careers) | no | Careers page returned 403 |
| Softchoice | IT services | unknown | [`(not found)`](https://www.softchoice.com/careers) | no | No ATS link in HTML |
| TTC | Transit | unknown | [`(not found)`](https://www.ttc.ca/jobs) | no | TTC Career Centre; system not identified from HTML |

## Count per ATS

| ATS | Companies | Verified |
|---|---|---|
| greenhouse | 20 | 20 |
| lever | 10 | 10 |
| ashby | 14 | 13 |
| smartrecruiters | 1 | 1 |
| workday | 20 | 19 |
| taleo | 0 | 0 |
| successfactors | 14 | 14 |
| oracle-recruiting | 2 | 2 |
| dayforce | 2 | 2 |
| adp | 1 | 1 |
| jobvite | 1 | 1 |
| icims | 1 | 1 |
| eightfold | 1 | 1 |
| phenom | 2 | 0 |
| custom | 6 | 1 |
| unknown | 4 | 0 |
| **total** | **99** | **86** |

## Open questions

- Whether each company hires new grads into our Role families is not verified. Every verified board had Toronto or Canada postings on the probe date, but junior-looking titles were few. The largest counts were EQ Bank (19), Lyft (12), 1Password (11) and Stripe (7). Several boards had none. A recheck in January to March, when new-grad cycles open, would settle it.
- The Workday `cxs` endpoint is what the public career site calls, but Workday does not document it as an API. Its stability and terms of use need a look before the worker depends on it (a job-source KB entry).
- SuccessFactors (14 companies), Dayforce, ADP, Jobvite, iCIMS, Eightfold and Phenom have no adapter yet. Each one is either a new Job source to build or a company left to JobSpy and the alert inbox.
- Phenom is a front end. For OMERS, the Workday board behind it was found. For Bell and OpenText, the ATS behind Phenom was not identified.
- Shopify uses Ashby (its careers page links `ashby_jid` postings), but its board slug was not found. Shopify's own careers page may be the only way in.
- Sun Life's student and new-grad postings may live on a second Workday site; `University-Jobs` returned 404.
- Loblaw's Workday tenant `myview` answered for site `loblaw_careers` with 0 jobs, so the real site name is still unknown.
- The Ontario Public Service portal (gojobs.gov.on.ca), TTC, City of Vaughan and Town of Halton Hills blocked or did not reveal their system to a plain request. They need a manual look in a browser.
- A few starting entries were not companies, or could not be resolved to an employer, and were left out.
- Several companies are remote-first and use "Remote - Canada" rather than a Toronto location (Ada, Mercury, Instacart). The worker's location filter has to accept those strings.

## Sources

Public board endpoints, called on 2026-10-29:

- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs`
- Lever: `https://api.lever.co/v0/postings/<slug>?mode=json`
- Ashby: `https://api.ashbyhq.com/posting-api/job-board/<slug>`
- SmartRecruiters: `https://api.smartrecruiters.com/v1/companies/<id>/postings`
- Workday: `https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` (POST)
- Oracle Recruiting Cloud: `https://<host>/hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=findReqs;siteNumber=<site>`

Careers pages read for ATS links (2026-10-29):

- Banks and finance: [jobs.scotiabank.com](https://jobs.scotiabank.com/), [eqbank.ca careers](https://www.eqbank.ca/about-us/about/careers), [ig.ca careers](https://www.ig.ca/en/careers), [questrade.com careers](https://www.questrade.com/about-us/careers), [interac.ca careers](https://www.interac.ca/en/company/careers/careers-at-interac/), [tmx.com careers](https://www.tmx.com/en/careers), [candescent.com careers](https://www.candescent.com/careers)
- Insurers and pensions: [aviva.ca careers](https://www.aviva.ca/en/careers/), [empire.ca careers](https://www.empire.ca/about-us/career-opportunities), [canadalife.com careers](https://www.canadalife.com/about-us/careers.html), [careers.omers.com](https://careers.omers.com/ca/en/search-results), [caatpension.ca careers](https://www.caatpension.ca/careers), [otpp.com careers](https://www.otpp.com/en-ca/careers/)
- Public sector and utilities: [jobs.opg.com](https://jobs.opg.com/), [jobs.hydroone.com](https://jobs.hydroone.com/search), [jobs.torontohydro.com](https://jobs.torontohydro.com/), [alectra.com careers](https://www.alectra.com/careers), [careers.ieso.ca](https://careers.ieso.ca/), [careers.mpac.ca](https://careers.mpac.ca/), [metrolinx.com careers](https://www.metrolinx.com/en/about-us/careers), [jobs.toronto.ca](https://jobs.toronto.ca/), [jobs.utoronto.ca](https://jobs.utoronto.ca/), [ttc.ca jobs](https://www.ttc.ca/jobs), [gojobs.gov.on.ca](https://www.gojobs.gov.on.ca/Jobs.aspx)
- Other employers: [wsp.com job opportunities](https://www.wsp.com/en-ca/careers/job-opportunities), [teck.com careers](https://www.teck.com/careers/), [fcr.ca careers](https://fcr.ca/careers/), [jobs.rogers.com](https://jobs.rogers.com/), [careers.telus.com](https://careers.telus.com/), [jobs.bell.ca](https://jobs.bell.ca/ca/en), [careers.opentext.com](https://careers.opentext.com/us/en), [careers.celestica.com](https://careers.celestica.com/), [careers.loblaw.ca](https://careers.loblaw.ca/)
- Tech: [shopify.com careers](https://www.shopify.com/careers), [partech.com careers](https://partech.com/careers-at-par/), [tophat.com careers](https://tophat.com/company/work-with-us/), [pointclickcare.com careers](https://pointclickcare.com/careers/), [freshbooks.com careers](https://www.freshbooks.com/careers), [careers.amd.com](https://careers.amd.com/careers-home/jobs), [Microsoft careers](https://jobs.careers.microsoft.com/global/en/search)

Secondary sources, used only to find leads that were then checked against the sources above: web search results for the CPP Investments Workday tenant (`cppib.wd10`), the Loblaw Workday tenant (`myview.wd3`) and the TTC Career Centre.

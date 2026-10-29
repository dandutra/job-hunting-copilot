# Gmail access for alert emails

Research for ticket #4. Researched on 2026-10-29 against Google, LinkedIn, Indeed and Glassdoor documentation and the source of open-source alert parsers on GitHub. Every claim cites a source in the list at the end; claims marked "unverified" have no primary source.

## Summary

1. Use the Gmail API with the `gmail.readonly` scope. It is the narrowest scope that returns message bodies, because `gmail.metadata` returns headers only and forbids the `q` search parameter [1][2].
2. Avoid the 7-day refresh-token expiry by setting the consent screen's publishing status to "In production" without verification. Google exempts personal-use apps with fewer than 100 users from verification, and the 7-day expiry applies only to "Testing" status [3][4][5].
3. Poll hourly instead of using push: alerts arrive at most daily [12][13][14], an hourly `history.list` call costs 2 quota units [6], and push needs a Pub/Sub topic plus a `watch` renewal at least every 7 days [7]. IMAP with an app password still works but Google discourages it [9][10], and forwarding adds a second mail system.
4. A Gmail filter applies one label (for example `job-alerts`) to the alert senders, and the worker reads only that label through `labelId`/`labelIds` [8][15][16]. The label limits what the worker reads. It does not limit what the token can read.
5. LinkedIn and Indeed alerts carry title, company, location and a job URL with a stable job ID. Indeed adds a relative age ("Just posted", "5 days ago"), and LinkedIn carries no date [17][18]. The HTML layout is unversioned and has changed at least once in 2026, so parsers must key on job IDs and fail loudly. Glassdoor's format could not be verified from public sources.

## Details

### Gmail API scopes

The scope page lists `gmail.readonly` and `gmail.metadata` as restricted scopes and `gmail.labels` as non-sensitive [1].

| Scope | What it gives | Works for alert parsing? |
|---|---|---|
| `gmail.labels` | Read and change labels only [1] | No. It cannot read messages. |
| `gmail.metadata` | "Labels and headers ... but not the email body" [1]. `messages.list` rejects `q` under this scope [2]. | No. Titles, companies and URLs live in the body. Only the subject line is visible. |
| `gmail.readonly` | Read all messages and settings [1] | Yes. This is the narrowest working scope. |
| `https://mail.google.com/` | Full access, including permanent delete [1]. It is the only scope for IMAP, POP and SMTP over XOAUTH2 [11]. | Yes, but broader than needed. |

`gmail.readonly` grants read access to the whole mailbox. Filtering by label happens in the worker's own code, so a leaked refresh token exposes every email. A smaller exposure is possible with a second Gmail account that receives only forwarded alerts and is the only account the worker authorizes (see Open questions).

### OAuth for a single user

Google documents these facts about refresh tokens:

- A project with an external user type and "Testing" publishing status gets refresh tokens that expire in 7 days, unless it asks only for basic identity scopes [3]. Test users' authorizations also expire 7 days after consent [4].
- "In production" status opens the app to any Google Account. An unverified app that requests sensitive or restricted scopes shows an "unverified app" screen, and the users who see it count toward a lifetime cap of 100 [4][5].
- Verification is not needed "if the app is for your personal use (fewer than 100 users)" [5]. Apps in testing are also exempt, but they keep the 100-user cap [5].
- A refresh token also stops working when the user revokes access, when it goes unused for six months, when the user changes their password and the token has Gmail scopes, or when a client exceeds 100 live refresh tokens for one account. In that last case the oldest token is dropped [3].

The 7-day expiry is avoided by putting the project in "In production" and authorizing once through the unverified-app warning. Google's docs tie the 7-day rule only to "Testing" status [3][4]. A 2022 forum thread reports 7-day expiry continuing after a switch to production [19]. That thread has no resolution and is unverified. It means the authorization should be redone after the status change, because a token issued under "Testing" keeps its 7-day life.

To get the token, the user creates a "Desktop app" OAuth client and runs the loopback-redirect flow once on their Mac. Google recommends the loopback redirect for desktop platforms, and the manual copy/paste (OOB) flow is no longer supported [20]. The refresh token then goes to the cloud host as a secret. Desktop clients are public clients whose secret is not confidential [20], so the refresh token is the credential to protect.

Re-authorization is needed after a Google password change [3]. That belongs in a runbook.

### Push (watch + Pub/Sub) vs polling

Push works like this: the app creates a Pub/Sub topic and grants publish rights to `gmail-api-push@system.gserviceaccount.com` [7]. It calls `users.watch` at least every 7 days (Google recommends daily) [7]. Each notification carries only the email address and a new `historyId`, so the app still calls `history.list` [7]. Pull subscriptions work without a public endpoint [7]. Google warns that notifications can be delayed or dropped and recommends a periodic `history.list` fallback anyway [7].

LinkedIn, Indeed and Glassdoor all send alerts daily or weekly [12][13][14], so push saves at most an hour on a Sighting that is already up to a day old. Polling is enough. A poll reads the label with `history.list` (`labelId`, `historyTypes=messageAdded`, 2 units) [6][8], then `messages.get` for each new message (20 units, or 60 with `format=full` or `raw`) [6]. The per-user limit is 6,000 units a minute [6]. History records are "typically available for at least one week" with no guarantee, and an expired `startHistoryId` returns 404 [21]. On a 404, the worker falls back to `messages.list` with `q=label:job-alerts after:<seconds>`. The `after:` operator takes Unix seconds to avoid its default midnight-Pacific interpretation [22].

### IMAP with an app password

IMAP is always on for personal Gmail accounts, and from January 2025 the enable/disable switch is gone [10]. App passwords need 2-Step Verification and are unavailable with Advanced Protection, security-key-only 2-Step Verification, or work and school accounts [9]. Google revokes them on every password change and says they "aren't recommended and are unnecessary in most cases" [9][10]. An app password gives full mailbox access, including sending. IMAP over OAuth needs the full `https://mail.google.com/` scope [11], which is broader than `gmail.readonly`. Gmail's IMAP extensions support label-scoped reads (`X-GM-LABELS`) and Gmail search syntax (`X-GM-RAW`) [23], so the label approach works over IMAP too.

IMAP is a fallback only. It needs no Cloud project, but it grants more access than the API scope.

### Forwarding

Gmail can forward selected messages with a filter after the target address confirms a verification link [15]. Forwarding to a webhook mail service or a second mailbox adds another system to run. Forwarding can also change the HTML. The `jam` parser keeps a separate code path for forwarded LinkedIn alerts because the forwarded copies lose the `data-test-id="job-card"` attributes [17]. Forwarding is useful only to isolate alerts in a second Gmail account (see Open questions).

### A filter and label so the worker reads only alerts

The user creates a Gmail filter on the alert senders that applies one label and, optionally, archives the message [16]. The worker resolves the label's ID once and passes it as `labelId` to `history.list` or `labelIds` to `messages.list` [2][8]. Filters affect only new mail when they forward [15]. Whether a labeling filter can be applied to existing mail is not stated on the help page [16].

Sender addresses seen in open-source code, for the filter's `from:` clause:

| Job source | Address | Evidence |
|---|---|---|
| LinkedIn | `jobalerts-noreply@linkedin.com` | `From:` header in a 2026 forwarded fixture, and the sender map of `jam` [17][18] |
| Indeed | `alert@indeed.com` | Sender map of `jam` [17] |
| Indeed | `jobalert@indeed.com`, `donotreply@jobalert.indeed.com` | Sender lists of two other projects [24][25], unverified |
| Glassdoor | `noreply@glassdoor.com` | A display name "Glassdoor Jobs" in one project [26] and sender lists in others [24], unverified for alerts |

Sender lists in other repos disagree, so the user should confirm the addresses against their own inbox before creating the filter. A domain filter (`from:(linkedin.com OR indeed.com OR glassdoor.com)`) catches too much. LinkedIn and Indeed also send messages, application updates and marketing from those domains.

Creating the filter through the API needs `gmail.settings.basic`, a restricted scope [1]. The user should create it by hand in the Gmail UI instead.

### What the alert emails carry

These findings come from the HTML fixtures and parsers in `Emmanuelpean/jam` [17][18], which hold real LinkedIn alerts from 2025 and 2026 and Indeed alerts. The fixtures belong to other people and are not copied here.

**LinkedIn** ([18], parser at [17])

- The subject has the form `“<alert name>”: <company> - <title> and more`.
- Each matching job is a `<td data-test-id="job-card">`. The title is a link styled with utility classes (`font-bold text-md leading-regular text-system-blue-50`). One `<p>` holds `Company · City (Hybrid|Remote|On-site)`, which maps to Work arrangement. An optional salary line reads like `£45K-£70K / year`. Badges include "Actively recruiting", "Easy Apply" and "N school alumni".
- No card carries a posting date.
- The job URL is `https://www.linkedin.com/comm/jobs/view/<numeric id>/?trackingId=…&refId=…&lipi=…&midToken=…&midSig=…&trk=…&trkEmail=…&eid=…&otpToken=…`. The canonical URL is `https://www.linkedin.com/jobs/view/<id>`.
- Some emails add a "Jobs where you'd be a top applicant" section. Its links point to `/comm/jobs/collections/top-applicant?currentJobId=<id>`, and those jobs are LinkedIn recommendations, not matches for the saved search. `jam` added a `currentJobId` fallback for this in March 2026 [27].
- The footer carries the recipient's full name and profile headline.

**Indeed** ([17], fixture at [28])

- The subject has the form `<N> new <query> jobs in <place>` or `Apply to jobs at <A>, <B> and <C>`. The body opens with "These job ads match your saved job alert".
- Each job is a `<td class="pb-24">` with an `<h2><a class="strong-text-link">` title. It also holds the company, an optional company rating (for example "3.4"), the location, an optional salary ("£45,000 - £80,000 a year", "£18.00 - £19.50 an hour"), an "Easily apply" badge, a snippet, and a relative age ("Just posted", "2 days ago").
- The parser finds company and location by matching inline `style` strings such as `color:#2d2d2d;font-size:14px;line-height:21px` [17]. That is the most fragile part of either parser.
- Organic jobs link to `https://<country>.indeed.com/rc/clk/dl?jk=<job key>&from=ja&…`. Sponsored jobs link to `/pagead/clk/dl?…` without a `jk`. `jam` resolves those redirects with `cloudscraper` [17], a library built to get past Cloudflare's bot checks, which adds to the ToS risk the KB already accepts for JobSpy. The canonical URL is `https://<country>.indeed.com/viewjob?jk=<job key>`.

**Glassdoor**

No open-source parser backed by a real Glassdoor alert fixture was found. One project's parser guesses at senders (`jobs-noreply@`, `noreply@`, `alerts@glassdoor.com`) and at link patterns (`glassdoor.com/job-listing/…`, `partner/jobListing.htm?jobListingId=…`) without fixtures [29]. That parser is unverified. Glassdoor's help page describes daily or weekly alerts and a limit of 10 alerts [14]. The page returned 403 to the fetcher, so these facts come from a search-result summary and are unverified. Secondary reports say Recruit Holdings began folding Glassdoor's operations into Indeed in July 2025 [30]. No primary source was found for that, so it is unverified. If true, Glassdoor alerts may end up close to Indeed's format.

### Mapping alert entries to Sightings

| Sighting field | LinkedIn | Indeed | Glassdoor |
|---|---|---|---|
| Source URL | `/jobs/view/<id>`, with tracking params stripped | `viewjob?jk=<key>`; sponsored links need a redirect | Unverified |
| Source ID | Numeric job ID | `jk` job key | Unverified |
| Date | Email receive time (`internalDate`) only | Relative age, plus the receive time | Unverified |
| Title, company, location | Yes | Yes | Unverified |
| Work arrangement | In parentheses after the city | In the snippet, sometimes | Unverified |
| Salary | Sometimes | Sometimes | Unverified |

The Sighting date is the email's receive time. Because alerts are daily, a Posting's real age can be up to a day older than its alert Sighting [12][13]. An earlier Sighting from an ATS board or JobSpy will set Posted at in that case.

### Format stability

None of the three companies publishes or versions its email format. The `jam` LinkedIn parser has a 2026 fix for `currentJobId` links and keeps a fallback for forwarded copies [17][27]. Its selectors depend on Tailwind-style class strings and Indeed's inline styles. Both can change in any template update without notice. A stable parser keys first on job IDs in URLs (`/jobs/view/<id>`, `jk=`), because those IDs back the canonical URLs. It treats text fields as best effort. It flags any alert email that yields zero entries as a parse failure, not as an empty alert.

### Privacy and secrets

Alert emails contain the user's name, profile headline and alert queries [18]. LinkedIn job links carry per-recipient tokens (`midToken`, `midSig`, `otpToken`) [18]. What those tokens grant is unverified, so the worker should treat raw URLs as secrets. It stores only canonical URLs and never logs raw ones. Under the "Personal data stays out of git" decision, raw emails and samples go only to Postgres or the gitignored `data/` folder, never into test fixtures in this public repo. Tests need synthetic fixtures.

### Alternative: Apps Script on the user's account

An Apps Script project owned by the user can read Gmail on an hourly time-driven trigger and POST entries to the API [31][32]. The cloud host then holds no Google refresh token. Consumer quotas are 20,000 email reads and 20,000 URL fetches a day, 6 minutes per run and 90 minutes of trigger time a day [31]. Scripts with sensitive scopes still show the unverified-app screen to users outside a Workspace domain [33]. Whether their authorization expires is not stated in Google's docs [33]. The code would live outside the deploy pipeline in the KB's "App runs in the cloud" decision, which is why it is not the recommendation.

## Open questions

- Does a production, unverified app's refresh token for `gmail.readonly` last past 7 days in practice? Google's docs say yes by implication [3][4], and one forum report says no [19]. The first week of running will answer it. The worker should alert on `invalid_grant`.
- Should the worker authorize a second Gmail account that receives only filtered, forwarded alerts? That shrinks what a leaked token exposes. It costs one forwarding filter and may change the HTML [15][17].
- What is the exact sender, subject and HTML of a Glassdoor alert today? This needs one real sample from the user's inbox, stored in `data/` only.
- Are the LinkedIn "top applicant" recommendations in an alert email Sightings? They do not match the saved search, but they are real Postings.
- Should the worker follow Indeed's sponsored `pagead` redirects to recover the `jk`, or drop those entries? Following them means automated requests to Indeed, and `jam` needs a Cloudflare-bypass library to do it [17].
- What do LinkedIn's `otpToken` and `midToken` parameters authorize? Not documented anywhere found.

## Sources

1. Gmail API, Choose Gmail API scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
2. Gmail API, `users.messages.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
3. Google Identity, Using OAuth 2.0 to Access Google APIs (refresh token expiration): https://developers.google.com/identity/protocols/oauth2
4. Google Cloud Help, Manage app audience: https://support.google.com/cloud/answer/15549945
5. Google Cloud Help, When is verification not needed: https://support.google.com/cloud/answer/13464323
6. Gmail API, Usage limits: https://developers.google.com/workspace/gmail/api/reference/quota
7. Gmail API, Push notifications: https://developers.google.com/workspace/gmail/api/guides/push
8. Gmail API, `users.history.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
9. Google Account Help, Sign in with app passwords: https://support.google.com/accounts/answer/185833
10. Gmail Help, Add Gmail to another email client (IMAP always on): https://support.google.com/mail/answer/7126229
11. Gmail IMAP, OAuth 2.0 Mechanism (XOAUTH2): https://developers.google.com/workspace/gmail/imap/xoauth2-protocol
12. LinkedIn Help, Job alerts on LinkedIn: https://www.linkedin.com/help/linkedin/answer/a511279
13. Indeed Help Center, Starting, stopping and managing job alerts: https://www.indeed.com/help/job-seekers/articles/204488890-starting-stopping-and-managing-job-alerts
14. Glassdoor Help, Job Alerts on Glassdoor (403 to the fetcher; content from a search summary, unverified): https://help.glassdoor.com/articles/en_US/Article/Job-Alerts-on-Glassdoor
15. Gmail Help, Automatically forward Gmail messages to another account: https://support.google.com/mail/answer/10957
16. Gmail Help, Create rules to filter your emails: https://support.google.com/mail/answer/6579
17. `Emmanuelpean/jam` alert parsers and sender map, commit 2f42ca2: https://github.com/Emmanuelpean/jam/tree/2f42ca25a3314b311a2f8d0aab27dac1daa79bb1/backend/app/job_email_scraping/email_parsers
18. `Emmanuelpean/jam` LinkedIn alert fixtures: https://github.com/Emmanuelpean/jam/tree/2f42ca25a3314b311a2f8d0aab27dac1daa79bb1/backend/tests/utils/resources/job_alert_emails
19. Google Ads API forum, "(OAuth) Token has been expired or revoked" (unresolved report): https://groups.google.com/g/adwords-api/c/EXh0Cjg5auw
20. Google Identity, OAuth 2.0 for iOS and desktop apps: https://developers.google.com/identity/protocols/oauth2/native-app
21. Gmail API, Synchronize clients with Gmail: https://developers.google.com/workspace/gmail/api/guides/sync
22. Gmail API, Searching for messages (filtering): https://developers.google.com/workspace/gmail/api/guides/filtering
23. Gmail IMAP extensions: https://developers.google.com/workspace/gmail/imap/imap-extensions
24. `eriktaylor/apply-daemon` sender config, commit 7fe5691: https://github.com/eriktaylor/apply-daemon/blob/7fe5691baa9235e6cd28e2e3f328e5208c55d0b8/src/email_config.py
25. `risingfish/myjobbot` default alert senders, commit 34bda62: https://github.com/risingfish/myjobbot/blob/34bda62c6bc10a46a3eb31a008e7e2efd2bc667b/src/gmail/alerts.ts
26. `devnull03/rust-webhooks` job checker, commit 79e4c33: https://github.com/devnull03/rust-webhooks/blob/79e4c33c9a529adc16dce413f7faf5496a5f558a/src/helpers/job_checker.rs
27. `Emmanuelpean/jam` commit 229ec2c, LinkedIn `currentJobId` fix (2026-03-18): https://github.com/Emmanuelpean/jam/commit/229ec2cb6a
28. `Emmanuelpean/jam` Indeed alert fixture: https://github.com/Emmanuelpean/jam/blob/2f42ca25a3314b311a2f8d0aab27dac1daa79bb1/backend/tests/utils/resources/job_alert_emails/indeed_email_4.html
29. `DDFaller/job-application-agents` Glassdoor parser (no fixtures), commit 5d24e85: https://github.com/DDFaller/job-application-agents/blob/5d24e859eb8e1c8d521e45a2e36dd7dad3ad0d44/integrations/email/parsers/glassdoor.py
30. The People's Board, "Glassdoor is Now Officially Part of Indeed" (secondary, unverified): https://www.thepeoplesboard.com/uncategorized/glassdoor-now-part-of-indeed-recruit-holdings/
31. Apps Script, Quotas for Google Services: https://developers.google.com/apps-script/guides/services/quotas
32. Apps Script, Installable triggers: https://developers.google.com/apps-script/guides/triggers/installable
33. Apps Script, OAuth client verification: https://developers.google.com/apps-script/guides/client-verification

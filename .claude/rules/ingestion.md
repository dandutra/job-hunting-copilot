---
paths:
  - "apps/api/src/ingestion/**"
---

# Job source adapters

An adapter that passes against `fixtures.json` can still break on the live API, as Workday did in #73 and hotfix #93 ([Workday career-site API](../../docs/kb/job-sources/workday.md)).

- Before the PR opens, run a changed adapter against one real tenant or board, and put the command and what came back in the PR's Verification section.
- When the live response differs in shape from the recorded one, re-record the adapter's `fixtures.json` from that run, trimmed, and update the live-run line in the Job source's concept under `docs/kb/job-sources/`.
- The JobSpy fixtures were never recorded from a run ([JobSpy scrape service](../../docs/kb/gotchas/jobspy-scrape-service.md)), so a JobSpy change gets its live check against the running service.

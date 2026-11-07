---
type: gotcha
title: Tailoring API
description: How the draft endpoints store, supersede, approve and reject Tailored resumes, and what rule 6 does on approve.
tags: [tailoring, api, privacy]
sources: ["#57", "#82"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-07T11:30:00-05:00
---

`apps/api/src/tailoring/` holds the five routes under `/postings/:id/` and `/tailored-resumes/:id`. The service calls `traceCheck` from `master-profile` and adds rule 6 itself.

- Rule 6 runs on submit and on approve. The check always runs against the latest profile version, so importing any new version makes every open draft fail approve with rule 6, even when no cited Entry changed. The fix is to submit a new draft against the new version.
- A submit lists every failing line (rules 1 to 5 and 6 together) in a 422 body `{ failures: [{ rule, location, detail }] }`. Failures hold IDs and locations, never draft text, so they are safe to log. The service logs only counts and IDs.
- The request body carries `profileVersion`. The service strips it, and the pasted `postingText`, before it calls `traceCheck`. The stored draft JSON has neither. `postingText` has its own column, and no GET returns it.
- A line is named by its location: `summary`, `experiences[0].bullets[1]`, `projects[0].bullets[0]`, `coverLetter[2]`. Verdicts and reject lines use the same names as the Trace check's failures.
- Status is `draft`, `approved`, `superseded` or `rejected`. A submit supersedes the Posting's earlier `draft` rows, never an approved one. Approve supersedes the earlier approved row. Review, approve and reject answer 409 on any row that is not a `draft`.
- The greeting and sign-off are built on read from the company name and the profile's contact name, not stored. The draft's section order sets the render order.
- `tailored_resume` references `master_profile_version` without a cascade, so tests delete Postings (which cascade to drafts) before versions.

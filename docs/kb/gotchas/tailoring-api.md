---
type: gotcha
title: Tailoring API
description: How the draft endpoints store, supersede, approve, render and reject Tailored resumes, what rule 6 does on approve, and which routes return the posting text and the rendered files.
tags: [tailoring, api, privacy, rendering]
sources: ["#57", "#58", "#82", "#43"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-19T12:00:00-05:00
---

`apps/api/src/tailoring/` holds the nine routes under `/postings/:id/` and `/tailored-resumes/:id`. The service calls `traceCheck` from `master-profile` and adds rule 6 itself.

- Rule 6 runs on submit and on approve. The check always runs against the latest profile version, so importing any new version makes every open draft fail approve with rule 6, even when no cited Entry changed. The fix is to submit a new draft against the new version.
- A submit lists every failing line (rules 1 to 5 and 6 together) in a 422 body `{ failures: [{ rule, location, detail }] }`. Failures hold IDs and locations, never draft text, so they are safe to log. The service logs only counts and IDs.
- The request body carries `profileVersion`. The service strips it before it calls `traceCheck`. The stored draft JSON has neither `profileVersion` nor the pasted `postingText`. `postingText` has its own column, and only `GET /tailored-resumes/:id/posting-text` returns it. The route is separate so that the draft's GET stays free of the Posting for `/tailor-review`.
- A line is named by its location: `summary[0]` (one per Highlight), `experiences[0].bullets[1]`, `projects[0].bullets[0]`, `coverLetter[2]`. Verdicts and reject lines use the same names as the Trace check's failures.
- Status is `draft`, `approved`, `superseded` or `rejected`. A submit supersedes the Posting's earlier `draft` rows, never an approved one. Approve supersedes the earlier approved row. Review, approve and reject answer 409 on any row that is not a `draft`.
- The greeting and sign-off are built on read from the company name and the profile's contact name, not stored. The draft's section order sets the render order.
- `tailored_resume.posting_id` is `ON DELETE RESTRICT`. A Posting merge (`SightingMatcher.absorb`) moves the absorbed Posting's drafts to the survivor, keeps the newest open draft and the newest approved one, and supersedes the rest. Any other path that deletes a Posting must move or delete its drafts first, and `resetTestDb` deletes drafts before Postings and versions.
- Submit and approve take a `FOR UPDATE` lock on the Posting row, so two concurrent submits can't both leave an open draft. A lock that finds no row means a merge deleted the Posting after the read, and the call answers 409 so the caller retries against the survivor. `absorb` locks both Postings in id order before it moves anything, so it and a draft write queue on the same lock instead of deadlocking. Review and reject write only where the status is still `draft`, and answer 409 otherwise.
- `GET /tailored-resumes/:id` is the whole input of `/tailor-review`. Besides the lines it returns `doNotClaims` (every live one in the draft's profile version) and, on each cite that is a Fact, `ownership` and `ownershipNote`. #57 shipped without them, so the review could not name a Do-not-claim or catch solo work claimed on a `team` Fact. They are not secrets, and the Posting stays out of the response. A cited Fact also carries its `sources`.
- `/tailor-review` reads `COPILOT_API_URL` from the `.env` in its working directory, and Tailscale Serve adds the identity header, as for `pnpm profile:import`. A run from a directory with another `.env` talks to whatever server that file names. `POST /tailored-resumes/:id/review` accepts a partial list and replaces the stored verdicts, so the skill reads the draft back to check that every line has one.

## Approve, render and files (#43)

- Approve renders before its transaction and writes the `rendered_file` rows inside it. A failed render answers 500 with a message free of draft text, and leaves the draft open and the Posting row unlocked.
- `GET /tailored-resumes/:id/files/:name` serves `resume.pdf`, `resume.docx`, `cover-letter.pdf` and `cover-letter.docx`. It answers 404 for an unknown draft or a missing file, and 409 for a draft that was never approved. A superseded draft that was once approved still serves its files.
- `rendered_file` cascades from `tailored_resume`, unlike the Restrict on the draft's Posting. A draft approved before migration `20261119160000` has no files, so its download answers 404.
- `GET /postings/:id/tailored-resumes` lists the drafts oldest first, with `ats` and `uploadFormat` from the one rule in `upload-format.ts`. The rule is low confidence: a Workday or Taleo Posting gets DOCX, and the real-ATS smoke test may change that list.
- `GET /postings/:id` names the newest draft in `tailoredResumeId`, which is how the Posting detail links to `/resumes/:id`.
- Fixed Experiences print the profile's live Facts whose `use` includes resume. That is an author reading of "the API fills fixed Experiences" in the ticket.
- The download file name comes from the profile's contact name with quote and path characters stripped, because it goes into `Content-Disposition`. The letter date is the Toronto day, not the UTC day.

---
type: gotcha
title: Jev judgement of a Posting
description: How the Jev runner decides what to judge, what it stores, and what never reaches the log.
tags: [jev, privacy]
sources: ["#29"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-10T15:30:00-05:00
---

`apps/api/src/jev/` asks Jev one request per Posting and stores the raw answers in `jev_judgement`. Rows are never updated or deleted, and the newest row per Posting is live.

- The runner keeps no queue. After every poll it reads the tables and judges a Posting that has no judgement, whose last judgement saw a snippet or nothing and is now full, or whose last judgement used an older profile version while the Posting is neither Closed nor Stale. A failed call stores nothing, so the same rule picks the Posting up on the next poll.
- A Posting with no judgement has no Tier. Never default it to C.
- A new question set version does not rejudge by itself. Bump `QUESTION_SET_VERSION` when any wording changes, and decide then whether to rerun.
- The model is pinned to `jev-1.14.0` and the client refuses an alias such as `jev-latest`. The stored `model` is the one Jev returned.
- Only 429 and 529 retry inside a call (three times, with backoff). A 500 waits for the next poll.
- The SDK log is off, and the runner logs only a Posting ID and an HTTP status. An SDK error message and a Jev error body can quote the request, which holds the profile summary.
- `TYPESAFE_API_KEY` empty means nothing is judged and the ingest process logs one warning at boot.
- A merge moves judgements to the surviving Posting, like Tailored resumes.
- The Noul threshold that turns a probability into "the text states it" is not chosen yet. It needs the manual run against real Postings, because no real response had been observed when this was built.

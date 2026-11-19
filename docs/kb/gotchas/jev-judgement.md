---
type: gotcha
title: Jev judgement of a Posting
description: How the Jev runner decides what to judge, which window, cap and failure rules limit it, what it stores, and what never reaches the log.
tags: [jev, privacy]
sources: ["#29", "#113"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-10T15:30:00-05:00
---

`apps/api/src/jev/` asks Jev one request per Posting and stores the raw answers in `jev_judgement`. Rows are never updated or deleted, and the newest row per Posting is live.

- The runner keeps no queue. After every poll it reads the tables and judges a Posting that is open, was posted in the last 14 days, and either has no judgement, was last judged on a snippet or nothing and is now full, or was last judged on an older profile version. The window applies to all three reasons. A Closed or Stale Posting with no judgement is never judged. Due Postings run newest `postedAt` first, then highest ID.
- At most 150 calls run in any 24 hours. A call counts when it stored a `jev_judgement` or a `jev_failure` row, so a call that stored nothing (the process died mid-call, or Jev was down) is not counted. `DAILY_CALL_CAP` sits beside `RUN_BUDGET_MS`. A profile import reaches the whole window over a day or more, and the run log's `capped` is what waited. #33 must leave candidate judgements out of this count, or they use up the cap.
- A Posting whose description turns full after it leaves the 14-day window stays judged on its snippet. The decision accepts that.
- A failure that is the Posting's fault (an `invalid` answer, or HTTP 400, 413 or 422) stores a `jev_failure` row with the kind and status and no message. Three rows and the Posting is no longer due, and nothing clears them. Any other failure ends the run for that poll and stores nothing: 429 or 529 after the client's retries, any 5xx, a network error, a `malformed` reply with no `model`, and every other 4xx. That last group covers a revoked key (401, 403), a used-up quota (402) and a retired model pin (404). The ticket first counted every 4xx but 429 as the Posting's fault, and a revoked key would then have retired the newest Postings about 50 a day. An outage, or a bad key, costs one call per poll.
- Known limits of the failure rules, not yet ticketed. A request-wide 400, 413 or 422 or an `invalid` answer (from the profile summary or the question set) still stores a failure on every call, and retires about 50 Postings a day because nothing clears `jev_failure`. A merge moves the absorbed Posting's failure rows, so a survivor can inherit up to 3 and stop being due. A reply with `model` but no `answers` counts as `invalid`, the Posting's fault, not `malformed`. `deploy/restore-drill.sh` `DRILL_TABLES` does not list `jev_failure`.
- `run({ postingIds })`, used by `jev:sample`, judges exactly those Postings and skips the window, the open check and the cap. It still stops on a Jev outage and respects the three-failure limit.
- A Posting with no judgement has no Tier. Never default it to C.
- A new question set version does not rejudge by itself. Bump `QUESTION_SET_VERSION` when any wording changes, and decide then whether to rerun.
- The model is pinned to `jev-1.14.0` and the client refuses an alias such as `jev-latest`. The stored `model` is the one Jev returned.
- Only 429 and 529 retry inside a call (three times, with backoff). The SDK also retries timeouts and dropped connections by default, so the client turns both off; a 500, a timeout or a dropped connection waits for the next poll.
- The batch runs inside the ingest lock, after the heartbeat. It stops between Postings on shutdown or after 20 minutes, so the lock frees before the next tick and a deploy's drain fits the 6-minute stop grace. The 150-call cap, not the budget, is what usually bounds a run.
- After a merge, the surviving Posting's newest row may be the absorbed Posting's judgement, made on the other text. It is not rerun unless the description moves to full or the profile changes.
- The SDK log is off, and the runner logs only a Posting ID and an HTTP status. An SDK error message and a Jev error body can quote the request, which holds the profile summary.
- `TYPESAFE_API_KEY` empty means nothing is judged and the ingest process logs one warning at boot.
- A merge moves judgements and `jev_failure` rows to the surviving Posting, like Tailored resumes. Failure rows feed the daily cap and the three-failure limit, so the cascade must never be what removes them.
- The Noul thresholds that turn a probability into "the text states it" live in `config/tier-config.json` as `capThresholds`, not in the question set. `outside_gta` is 0.5; the others keep TypeSafe's suggested 0.7, unchecked against real text. The first real run (2026-11-10, 10 local Postings with full descriptions, `pnpm --filter api jev:sample`) says 0.7 is too high for `outside_gta`. Lachine scored 0.76, but Vancouver, Greater Sudbury and Brantford scored 0.52 to 0.57, while every GTA or remote Posting scored 0.11 or less. A cut at 0.5 separated all ten. `closed_to_juniors` came out 0.86 to 0.92 for "3+ years" and "four years", 0.75 for a Senior title and 0.61 for "5+ years". So it ranks years inconsistently, and whether "3+ years" counts as closed to juniors is a product decision, not a threshold.
- `jev:sample` imports `data/master-profile.yaml` into the local database and sends its fit summary to TypeSafe. Each call used about 4,500 to 5,400 input tokens.

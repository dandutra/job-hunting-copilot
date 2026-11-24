---
type: gotcha
title: Label queue and Feed correction API
description: How the queue draws, what a batch is, when undo works, and where the phase dates and the Feed correction alert live.
tags: [jev, calibration, api]
sources: ["#31", "#119"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-11T13:00:00-05:00
---

The endpoints are in `apps/api/src/labels/labels.controller.ts`: `GET /label-queue/next`, `POST /label-queue/labels`, `DELETE /label-queue/labels/last` and `POST /postings/:id/feed-correction`.

- The phase dates are a TypeScript constant in `labels/schedule.ts`, not a file in `config/`, because the API image has no `config/` folder. They are Toronto midnights in winter. Outside every window `GET /label-queue/next` answers 204. Spot-check months are UTC months.
- `label_draw` holds the one Posting on screen, so a reload shows it again and an undo can put the undone Posting back. A draw made before the current window started is dropped, even when the phase name matches, and its label post answers 409.
- A batch is the Labels sharing a `batch` number. It is done at 10 Labels that fill a slot, and the next draw opens the next number. A batch also closes when a new phase window starts. `slot` is the Tier the draw was for, so `tier_at_draw` shows the real Tier when a short Tier fell to the next one down. C has nothing below it, so a short C leaves its slot open until stock arrives.
- Repeats have a null slot. A test-phase `cant_tell` keeps its slot but does not fill it, so the draw repeats for that Tier. The test counts 70 filling Labels and 10 repeats per window, and the repeats are mixed in at random in proportion to what is left.
- A repeat comes from a `tuning` Label given A, B or C in the first 7 days of the tuning window. It is stored as phase `repeat` with the Posting's current Tier and config version.
- Eligibility is a full description, no Label yet, not on screen, and no Sighting first seen before Nov 15. A Posting that merged an older one is out. Closed and Stale Postings stay in. The Tier at draw and its config version are copied from `posting_tier`, so a Posting with no Tier is never drawn.
- About 1 in 4 C draws in tuning and test asks for a capped Posting, and takes the other kind when none is left. The spot check draws C at random.
- Undo deletes the newest Label overall if its batch is not done and it was made in the open window. It refuses with 409 on an empty table, a done batch, a closed queue or a Label from an earlier window, because an undone Label from a closed window could never be re-keyed in its own phase.
- A merge moves Labels and Feed corrections to the surviving Posting. Both tables restrict deletion of their Posting.
- A Feed correction needs a stored Tier, and answers 409 when the user's Tier equals it. The third Posting corrected from C to A in 7 days sets `alerted_at` on its row and calls `AlertHook` with kind `tier_drift` after the commit. Postings are counted, not rows, so a double tap is not drift. A failing hook is logged, and the window stays marked. The next alert needs 7 days since `alerted_at`.
- A timed-out test breaks the next ones. Two e2e tests in `test/label-queue.e2e.spec.ts` are heavy: "draws a batch of 3 A, 3 B and 4 C..." seeds 170 Postings and "fills 21, 21 and 28..." seeds 140 with over 80 HTTP round trips. Both ran close to Jest's 5 s default on a slow runner. Jest does not stop a timed-out test body, so it keeps writing Labels while the next test's `resetTestDb` runs, and the reset fails on `label_posting_id_fkey`. That failure takes two or three more tests down with it. `apps/api/jest.config.js` now sets `testTimeout: 20_000` for every API suite (#119), so a real hang takes 20 s to fail. A `label_posting_id_fkey` error in `resetTestDb` points at an earlier test that timed out, so read the first failure in the file, not the FK errors.
- No log line carries a Label. Parse errors never echo the submitted value.

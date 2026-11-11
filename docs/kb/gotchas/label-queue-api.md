---
type: gotcha
title: Label queue and Feed correction API
description: How the queue draws, what a batch is, when undo works, and where the phase dates and the Feed correction alert live.
tags: [jev, calibration, api]
sources: ["#31"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-11T13:00:00-05:00
---

The endpoints are in `apps/api/src/labels/labels.controller.ts`: `GET /label-queue/next`, `POST /label-queue/labels`, `DELETE /label-queue/labels/last` and `POST /postings/:id/feed-correction`.

- The phase dates are a TypeScript constant in `labels/schedule.ts`, not a file in `config/`, because the API image has no `config/` folder. They are Toronto midnights in winter. Outside every window `GET /label-queue/next` answers 204. Spot-check months are UTC months.
- `label_draw` holds the one Posting on screen, so a reload shows it again and an undo can put the undone Posting back. A draw from an earlier phase is dropped when the phase has moved on, and its label post answers 409.
- A batch is the Labels sharing a `batch` number. It is done at 10 Labels that fill a slot, and the next draw opens the next number. A batch also closes when a new phase window starts. `slot` is the Tier the draw was for, so `tier_at_draw` shows the real Tier when a short Tier fell to the next one down. C has nothing below it, so a short C leaves its slot open until stock arrives.
- Repeats have a null slot. A test-phase `cant_tell` keeps its slot but does not fill it, so the draw repeats for that Tier. The test counts 70 filling Labels and 10 repeats per window, and the repeats are mixed in at random in proportion to what is left.
- A repeat comes from a `tuning` Label given A, B or C in the first 7 days of the tuning window. It is stored as phase `repeat` with the Posting's current Tier and config version.
- Eligibility is a full description, no Label yet, not on screen, and no Sighting first seen before Nov 15. A Posting that merged an older one is out. Closed and Stale Postings stay in. The Tier at draw and its config version are copied from `posting_tier`, so a Posting with no Tier is never drawn.
- About 1 in 4 C draws in tuning and test asks for a capped Posting, and takes the other kind when none is left. The spot check draws C at random.
- Undo deletes the newest Label overall if its batch is not done. It refuses with 409 on an empty table or a done batch. It does not check the phase.
- A merge moves Labels and Feed corrections to the surviving Posting. Both tables restrict deletion of their Posting.
- A Feed correction needs a stored Tier, and answers 409 when the user's Tier equals it. The third C-to-A correction in 7 days sets `alerted_at` on its row and calls `AlertHook` with kind `tier_drift` after the commit. A failing hook is logged, and the window stays marked. The next alert needs 7 days since `alerted_at`.
- No log line carries a Label. Parse errors never echo the submitted value.

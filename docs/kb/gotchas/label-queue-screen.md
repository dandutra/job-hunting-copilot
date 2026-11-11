---
type: gotcha
title: Label queue screen
description: How the Label queue screen counts a batch, handles undo and keys, and what it never renders.
tags: [web, calibration, labels]
sources: ["#63"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-11T14:30:00-05:00
---
The screen is `apps/web/src/labels/LabelScreen.tsx`, mounted at `/labels`. It renders only the fields of `GET /label-queue/next` and nothing Tier-derived, and a test fails if the word "tier" or a `tier` class appears.
- The progress count lives in the browser. A reload starts it at 0 even when the open batch already holds Labels, and the Undo link stays hidden until one answer is given in that session. The API still undoes the real last Label of the batch.
- The done screen shows when `POST /label-queue/labels` answers `batchDone`, or when `next` answers 204 after at least one answer. Its Label count is the answers given in the session, so a test-phase "Can't tell" counts here although it does not fill a slot.
- Keys 1 to 4 and `u` are ignored while a request is in flight and while a field has focus. The in-flight flag is released just before the next card renders.
- Undo calls `DELETE /label-queue/labels/last`, then fetches `next`, which returns the undone Posting.

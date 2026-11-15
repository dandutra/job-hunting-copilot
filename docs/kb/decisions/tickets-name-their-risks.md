---
type: decision
title: Tickets name their risks when written
description: A build ticket lists what its seam tests would not catch, the live check it needs and its review tier at planning time, because the risks that surfaced late on #31, #35, #37, #38 and #73 could all have been foreseen then.
tags: [workflow]
sources: ["#31", "#35", "#37", "#38", "#73", "#93"]
generated:
  by: claude-opus-5-5
  at: 2026-11-14T12:00:00-05:00
---

Until November 2026 a ticket had Source, Touches, Seams and Acceptance, with no place for risk. Five tickets then hit a risk that was visible before any code was written, but each surfaced only in review, in CI or in production:

- #31: a review agent ran the test suite on the shared test database while the build was using it.
- #35: the B2 endpoint variable was missing.
- #37 and #38: a new env var reached the code but not the deploy.
- #73: the Workday adapter passed against its fixtures, and one Important finding reached production and needed hotfix #93.

More review did not find these, because a reviewer reads the diff, and a missing workflow line or a live API's shape is not in the diff. So each ticket now names its risks with the test, live check or manual step that handles each one, names a live check against the real system, and sets a review tier that `/review` treats as a floor. The PR then reports only the risks the ticket did not list.

The format lives in [issue-tracker.md](../../agents/issue-tracker.md) and the ticket form. This file records only the reason.

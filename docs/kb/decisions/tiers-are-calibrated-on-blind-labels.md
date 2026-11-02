---
type: decision
title: Tiers are calibrated on blind Labels
description: Only Labels from the Label queue, with the Tier hidden and the Postings picked by the app across every Tier, count toward tuning and the pass marks; corrections made in the feed never do.
tags: [jev, tiers, calibration]
sources: ["#11"]
generated:
  by: claude-opus-5-5
  at: 2026-11-02T12:20:00-05:00
---

The obvious place to collect the user's judgement is the feed, but the feed is grouped by Tier. Seeing Jev's Tier pulls a Label toward it, and the user mostly reaches the top of the feed. Agreement would look higher than it is, and a good Posting buried in C would never be labelled. A miss is the expensive mistake here, because it costs a real application, and feed labels are the one measurement that can't see it.

So calibration runs on a separate Label queue. It hides the Tier and Jev's answers, and each batch of 10 takes 3 Postings from A, 3 from B and 4 from C. Only these Labels feed tuning and the pass marks. A Feed correction is stored apart as a report of a wrong Tier. The cost is one more screen and about 5 minutes a day for 3 weeks.

The choice is hard to undo: a Label collected in view of the Tier can't be cleaned up later, so non-blind data could not be reused as the regression set that guards every Jev upgrade. The protocol, sample sizes and pass marks are in [Jev calibration protocol](https://github.com/dandutra/job-hunting-copilot/issues/11).

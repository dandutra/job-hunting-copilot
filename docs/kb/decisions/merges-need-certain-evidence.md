---
type: decision
title: Merges need certain evidence
description: Two Sightings merge automatically only on an exact key or near-identical text; anything weaker stays apart as a Lookalike, and every automatic merge is logged for review.
tags: [ingestion, matching]
sources: ["#10"]
generated:
  by: claude-opus-5-5
  at: 2026-10-30T14:25:00-04:00
---

A false merge hides a real opening under another card, so the user could miss a job without knowing it. A false split only shows two cards. The user asked for merges to be certain, so company, title and location together are not enough: a bank that isn't a Watched company can post "Software Developer" twice on LinkedIn, and both listings pass that test.

An automatic merge needs an exact key, or the same Company through an alias, an equal normalized title and the same metro, plus full descriptions with similarity of 0.9 or more, or an Adzuna snippet found word for word in the other side's full description. Every merge edge qualifies on its own, and two listing keys on one board never merge.

Only an exact key is truly certain, and exact keys alone would leave the user merging several Postings by hand each day. Employers paste the same text onto every board, so near-identical text was accepted as the second rule. The remaining risk is covered by a merge log that the user reviews, and by a split that stops the matcher from rejoining the pair. The full rules are in [How Sightings match a Posting](https://github.com/dandutra/job-hunting-copilot/issues/10).

---
type: gotcha
title: Tier scoring and recompute
description: How a stored judgement becomes a Tier, what the config may not break, and what pnpm tier:recompute does and refuses.
tags: [jev, tiers]
sources: ["#30"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-10T19:00:00-05:00
---

`apps/api/src/tiers/` turns the newest `jev_judgement` of a Posting into a `posting_tier` row. No Jev call is involved, so a weight change costs nothing.

- The total is `scoreWeight` times the skills Score plus the rest times the level Score, each divided by its levels minus 1, plus the Role family and Work arrangement points. A total equal to a threshold takes the higher Tier.
- `not_stated` adds zero and is not a config key. `other` is a Role family key and may not exceed `support`.
- A Tier cap holds the Posting at C and the row names it in `caps_applied`. The total is still stored, so tuning can see how strong a capped Posting was.
- `config/tier-config.json` is rejected if it breaks the order full-stack ≥ back-end ≥ front-end ≥ cloud/ops ≥ support ≥ other or hybrid ≥ remote ≥ on-site, if `thresholds.a` is not above `thresholds.b`, or if a key is missing. Equal points are allowed.
- The config version is the SHA-256 of the file bytes, so reformatting the file is a new version. Each row stores that version and the judgement ID.
- A Posting with no judgement has no row, and so no Tier. It counts as skipped, never as C. A stored answer that no longer validates counts as failed and keeps its old row.
- Thin is not stored. It is `descriptionKind !== "full"` (`isThin`), computed when a screen reads the Posting.
- `pnpm tier:recompute` prints found, processed, skipped and failed, and exits 1 when it processed none. `--seed-thresholds` first rewrites `thresholds` by rank (top 10% of totals A, next 30% B) over Postings with no cap, because a capped Posting never reaches A or B. It refuses when the totals are too few or too alike to separate A from B.
- `--seed-thresholds` rewrites `config/tier-config.json` in place and does not commit it. The shipped thresholds (0.9 and 0.6) are placeholders until a seed run on real judgements.
- `posting_tier` cascades with its Posting and restricts deletion of its judgement. A test that deletes judgements must delete tiers first.

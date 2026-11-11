---
type: gotcha
title: Merge review API
description: How splits, "not the same" pairs, hand merges and the reviewed flag behave, and what the review screen must know.
tags: [matching, api]
sources: ["#25"]
generated:
  by: claude-opus-5-5
  at: 2026-11-11T12:00:00-05:00
---

The endpoints are in `apps/api/src/matching/merge-review.controller.ts`: `GET /merge-log`, `POST /merge-log/:id/review`, `POST /sightings/:id/split`, `GET /lookalikes`, `POST /lookalikes/:id/merge` and `POST /lookalikes/:id/dismiss`.

- The "not the same" pair is between two Postings (`not_same_pair`, lower id first), not between Sightings. A split records the original Posting and the new one. A dismissed Lookalike records its two Postings. When `absorbPosting` deletes a Posting, its pairs move to the survivor, so a later merge cannot undo a split. After the move, `absorbPosting` deletes any Lookalike between the survivor and a Posting it is "not the same" as. Without that, a merge could re-point a third Posting's Lookalike onto a dismissed pair.
- The matcher checks the pair in two places. The exact-key phase skips a candidate that is "not the same" as the Posting the draft already joins or has absorbed, and `applyTextRules` drops such a candidate before it can merge or become a Lookalike. A draft whose own Sighting was split off keeps hitting its old key partner and stays apart.
- A split needs at least two Sightings on the Posting (409 otherwise). The new Posting copies the Sighting's fields. Tailored resumes, judgements and the Tier stay on the original Posting, and the new one has none until Jev judges it and `tier:recompute` runs. Both Postings recompute their fields and Posted at.
- The split Sighting's merge log entries stay as they were, so an old entry can name a Sighting that no longer sits on that entry's Posting.
- The merge log has `reviewed_at`. Exact-key merges (`shared_listing_key`, `direct_url`) and hand merges (`manual_merge`) are stored reviewed. Only `text_similarity` entries wait. The migration backfills old exact-key rows. Marking an entry reviewed keeps its first timestamp.
- A Lookalike merge keeps the lower Posting id, like a text merge, and does not call the Jev hook. When it crosses two Companies, it moves every Posting, Sighting and alias of the other Company to the surviving one and deletes the other. That is how the second name becomes an alias. A Watched company always survives. If both are Watched, the merge answers 409. A Lookalike whose two Postings are a "not the same" pair also answers 409.
- Because a hand merge can delete a Company, `matchSighting` checks inside the matcher lock that the Company it resolved still exists. If it is gone, it looks the name up in `company_alias` on the same transaction, so it never waits on a second pool connection while holding the lock. `sighting.company_id` has no foreign key, so a stale id would be stored silently.
- A dismissed Lookalike is deleted. Only the pair remains.

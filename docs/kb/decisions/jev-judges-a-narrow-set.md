---
type: decision
title: Jev judges a narrow set of Postings
description: Jev judges only open Postings posted in the last 14 days whose title passes the Title filter, newest first and at most 150 calls a day; a filtered Posting gets no Tier and leaves the feed.
tags: [jev, tiers, feed]
sources: ["#113", "#114", "#115"]
generated:
  by: claude-opus-5-5
  at: 2026-11-19T12:00:00-05:00
---

The first production backlog judged every stored Posting, 5,769 of them, and gave 251 A, 1,165 B and 4,353 C. That is far more than the user can read, let alone apply to. Each call costs about 5,000 input tokens, an old Posting costs as much as a new one, and the runner worked oldest first.

Jev now judges a Posting only while it is open and its Posted at is within the last 14 days. The window applies to every reason for a call: a first judgement, a description that turned full, and a newer Master profile. Inside the window the newest Postings go first, and the runner stops at 150 calls in any 24 hours. A profile import therefore reaches the whole window over a day or more instead of in one batch. A Posting outside the window keeps the Tier it already has until it goes Closed or Stale.

The Title filter keeps a Posting away from Jev when its title names a level the user is not applying for, such as Senior, Director or Intern. The user saw such Postings in Tier A and decided they are noise. A Tier cap was the alternative, but a cap still pays for the call and keeps the Posting visible at C, which the glossary requires of a cap. So a filtered Posting gets no judgement and no Tier, and it leaves the feed and the Label queue. A Posting judged before its title was filtered loses its Tier at the next recompute. The filter reads the title alone, so a word such as "Student" in a product name can drop a real match. The user accepted that risk. Since 2026-11-20 the Title filter also holds an include list and runs at ingestion too; see [Titles are filtered at ingestion](titles-are-filtered-at-ingestion.md).

Calibration still measures what matters, because Labels are drawn only from Postings with a Tier, and those are the Postings Jev judges.

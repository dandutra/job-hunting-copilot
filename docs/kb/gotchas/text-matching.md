---
type: gotcha
title: Text merges and Lookalikes
description: How rule 3 and the Lookalike cases behave in the matcher, including the conservative choices the resolution left open and the guesses no real data has tested.
tags: [ingestion, matching]
sources: ["#24"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-10T19:00:00-05:00
---

After the exact-key phase, `matchSighting` runs `applyTextRules` for the draft's Sighting against Postings it shares no key with. The pair logic is the pure `judgePair` in `apps/api/src/matching/pair-verdict.ts`.

- Only Sightings seen in the last 30 days are compared, and only the draft's own Sighting is the edge. In a bridge, A merges into B only if the new Sighting's link to A passes rule 3. Every poll reruns the phase, so a Lookalike turns into a merge when a later poll brings the text.
- The merge bar is shingle similarity (Jaccard on 5-word shingles) of 0.9, and it is a constant that tuning must not lower. The veto is below 0.5 and is an untuned guess, because no real Postings have been compared yet. Between the two, the pair is a Lookalike.
- A description under 30 words is no evidence either way: no merge and no veto. A snippet counts only from Adzuna, needs 10 words, and ignores its last word when it ends in an ellipsis, because the cut may be mid-word.
- The veto applies to every Lookalike case, not only to equal titles. Two full descriptions that clearly differ create no link. One vetoing Sighting keeps its whole Posting apart, even when another Sighting on it would merge.
- Rule 3 judges only the draft's edge, so before each absorb every full description on the home Posting is also checked against every one on the candidate. A clash under 0.5 skips the pair with no link, and anything under 0.9 gives a `same_title` Lookalike. Without this, one Adzuna snippet of a shared company blurb would join two different openings.
- Title normalization drops a bracket or dash part only when it names a place or a work mode, and drops requisition ids anywhere. Employment type stays, because an employer can paste one text onto a full-time and a part-time requisition. A part that mixes a place with an employment type keeps only the employment words. Two titles that differ only in employment words never merge but get a `similar_title` Lookalike, because their bigram similarity can fall under 0.8. "Engineer - Payments" and "Engineer - Platform" stay two titles. `C++`, `C#`, `F#` and `.NET` are rewritten before punctuation is stripped, or they would all collapse to "c".
- Metro comes from the Search area code. Two places outside the area are one metro only when their text is equal.
- Lookalike case 2 reuses `findSimilarCompanies`: 0.8 Dice on the normalized names, or one name that is the other plus more whole words. "Deloitte" against "Deloitte LLP" scores 0.78 on Dice and passes only by the word rule. The call loads every alias on each draft, which is fine at this size.
- Two listings of one board with equal text are never merged (the board veto) and get a Lookalike with reason `same_title`.
- A board Sighting that passes rule 3 with two ATS Postings, or with one while its own Posting is an ATS Posting, joins none of them. Each gets a `board_tie` Lookalike. It joins the single ATS Posting that passes when the others do not.
- The surviving Posting of a text merge is the one with the lower id. `absorbPosting` re-points the absorbed Posting's Lookalikes and keeps one row per pair, with the lower id first.
- Every text merge writes a merge log entry with rule `text_similarity`, the method, the measured similarity (null for a snippet) and both Sighting ids.
- A pair the user split or dismissed is never merged or linked again; see [Merge review API](merge-review-api.md). Lookalike case 4 arrives with Applications in #77.

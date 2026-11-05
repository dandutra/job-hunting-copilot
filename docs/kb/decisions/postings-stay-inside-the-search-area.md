---
type: decision
title: Postings stay inside the Search area
description: Every Job source adapter drops rows outside the Search area before matching, so out-of-area jobs are never stored, and a board job that leaves the area counts as missing.
tags: [ingestion, feed]
sources: ["#67"]
generated:
  by: claude-opus-5-5
  at: 2026-11-05T15:00:00-05:00
---

The search is for work in Toronto, the GTA, or remote from Canada. A Watched company's board lists jobs worldwide (RBC lists 852), and JobSpy searched all of Canada. Sending every row to matching would have Jev score hundreds of Postings the user can never take.

One shared function in `apps/api/src/ingestion/` decides whether a row's location text is in the Search area: Toronto, Mississauga, Brampton, Markham, Vaughan, Richmond Hill, Oakville, Milton, Pickering, Ajax, Whitby, Oshawa, Newmarket or Aurora, remote work naming Canada or Ontario, or remote work naming no country. A row with several places is in the area if any one is. Every adapter applies it before `matchSighting`, so the feed's scope never depends on which Job source found a Posting.

The filter runs on location text, not on a board's own location facets, because Workday facets undercount (RBC's Toronto facet held 14 of about 222 Toronto jobs). A Workday row that shows "N Locations" gets a detail call before it is judged.

Rows outside the area are never stored, so widening the area later (Hamilton, Waterloo) recovers only jobs still listed, not past ones. A board's complete listing means its complete in-area listing, so a job whose location moves out of the area counts as missing and closes after 24 hours, under [Only boards close a Posting](only-boards-close-a-posting.md).

---
type: decision
title: Titles are filtered at ingestion
description: Every adapter's rows pass the Title filter, an include list and an exclude list in config/title-filter.json, before matching, after the full listing is read; a failing row is never stored, and a stored Posting that fails loses its Tier.
tags: [ingestion, jev, feed]
sources: ["#123", "#124"]
generated:
  by: claude-opus-5-5
  at: 2026-11-20T15:00:00-05:00
---

The app exists to find the roles the user is applying for, but until #123 no adapter looked at a title. The four board adapters stored every job at a Watched company inside the Search area, so a "Mechanical Engineer" or an "Account Executive" was stored and judged. JobSpy searched a single term, "software developer", because production never set `JOBSPY_SEARCH_TERM`. The only title rule was an exclude list of level words at the Jev stage.

The Title filter now has two lists in the committed `config/title-filter.json`. A title passes when it holds an include phrase, such as "software engineer" or "full stack", and no exclude word, such as Senior or Intern. An exclude list alone lets in every role nobody thought to block. An include list alone would need every role listed at every level. Together, the include list names the roles and the exclude list names the levels. The cost is that a good role nobody listed, under a title no phrase matches, is never seen. The per-adapter "dropped N of M rows by title" log line is how the user tunes the list. The list is public, like the tier config, because it names roles and nothing about the user.

The filter runs in the ingest scheduler after an adapter returns and before matching, so every adapter, including ones not yet built, is covered with no code of its own. The Workday adapter also applies it before a detail call, so a dropped title costs no request. The same function runs at the Jev stage and in the recompute, so Postings stored before the filter lose their Tier at the next recompute.

The filter reads the full listing and never uses an ATS's own search. A searched listing is partial, so a job missing from it would look gone and close. Filtering after the read keeps the [Only boards close a Posting](only-boards-close-a-posting.md) evidence sound. As with the Search area, a board job retitled to a failing title stops being refreshed and closes after the 24-hour grace. The user accepted this. Loosening the list brings board jobs back within an hour, because every board is read in full each hour, but a JobSpy row dropped earlier is gone for good.

JobSpy searches LinkedIn and Indeed for a short `searchTerms` list in the same file, kept apart from the include list because a search term must find rows on a board, while an include phrase only has to recognize a title. The terms go in one `OR` query per board, or rotate hourly on a board that ignores `OR` (the live check in [JobSpy scrape service](../gotchas/jobspy-scrape-service.md) records which).

Machine learning roles are excluded on purpose: the user considers them a different kind of work. The AI-enabled developer group of include phrases covers developers who build on AI models. It is not a Role family yet. If the user wants these roles ranked above others, it can become one later, which changes Jev's question set and the tier config and means judging Postings again.

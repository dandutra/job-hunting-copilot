---
type: gotcha
title: Company names and Watched boards
description: Name normalization strips "Canada" even from "Royal Bank of Canada", so such a name needs a seed alias, only five ATSes count as pollable, and a found board survives the seed unless a verified CSV row claims its pair.
tags: [companies, ingestion]
sources: ["#22", "#73", "#130"]
generated:
  by: claude-opus-5-5
  at: 2026-11-09T12:00:00-05:00
---

`normalizeName` lowercases, collapses spaces and strips trailing Inc, Ltd, Corp and Canada. "Royal Bank of Canada" becomes `royal bank of`, and "RBC" stays `rbc`, so nothing joins them by itself. `SEED_ALIASES` in `apps/api/src/companies/seed.ts` lists the other spellings the seed adds, and a subsidiary never goes there. Both the stored alias and the lookup go through the same function, so the odd form still matches.

A name that normalizes to nothing (" Inc. ") is rejected, not stored.

The seed makes a Company of every CSV row. A row gives its Company a curated board only when `verified` is `yes` and its ATS is greenhouse, lever, ashby, smartrecruiters or workday. SuccessFactors, Dayforce, iCIMS and the other ATSes in the CSV have no public JSON board API, so those rows stay plain Companies even when verified. A Workday slug is `tenant.wdN/site`, taken from the row's URL by the seed, because the polling host needs the data centre.

A Company can also get a board from `discoverBoards` ([Boards are found, not only curated](../decisions/boards-are-found-not-only-curated.md)), which sets `boardFoundAt`. Two rules follow for the seed. It clears a board only when `boardFoundAt` is null, so a found board survives a seed run. A verified CSV row outranks a found board: it clears every found board with the same `boardKey` (slug decoded and lowercased, a Workday tenant without its site) and sets its own `boardFoundAt` to null. Without that, the unique `(ats, boardSlug)` pair would make the seed throw, or two Companies would poll one board under two spellings. A found board is never in the CSV, so the CSV's counts do not match the Watched companies in the database.

Board identity has one home, `boardKey` in `apps/api/src/companies/board-from-url.ts`, and anything that asks whether two boards are the same must use it. It decodes and lowercases the slug, because the listing key lowercases it while `@@unique([ats, boardSlug])` in Postgres compares case-sensitively. For Workday it uses the tenant alone, which also covers an old `tenant/site` slug. A Workday listing key is `workday:<tenant>:<req>` with no site, so two boards on different sites of one tenant read the same keys, and each poll hands the Sighting to whichever board was read last, because `refreshSighting` sets `companyId` from the draft's `watchedCompanyId`. `parseListingKey` also accepts EU hosts (`jobs.eu.lever.co`, `boards.eu.greenhouse.io`, `job-boards.eu.greenhouse.io`) that no adapter can read, because the adapters call only the global APIs. Code that turns a parsed URL into a board must drop them, as `boardFromUrl` does.

Some slugs in the CSV are copied from board URLs and arrive percent-encoded, such as Ashby's `PAR%20Technology`. The board adapters decode a slug before encoding it into the API URL (`slugPath`), so the API is called with `%20`, not `%2520`. The listing key keeps the slug as stored, which is also what `parseListingKey` reads from the job URL.

Tests run against a `<database>_test` database that `test/global-setup.ts` creates and migrates. Docker Compose Postgres must be up, and the shell must run Node 22 (see [Toolchain version pins](toolchain-version-pins.md)).

`findSimilarCompanies` scores every alias with bigram Dice at 0.8 or more. It loads all aliases, which is fine at about 100 Companies. Move it to `pg_trgm` if the table grows past a few thousand.

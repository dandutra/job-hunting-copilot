---
type: gotcha
title: Company names and Watched boards
description: Name normalization strips "Canada" even from "Royal Bank of Canada", so such a name needs a seed alias, and only five ATSes count as pollable.
tags: [companies, ingestion]
sources: ["#22", "#73"]
generated:
  by: claude-opus-5-5
  at: 2026-11-09T12:00:00-05:00
---

`normalizeName` lowercases, collapses spaces and strips trailing Inc, Ltd, Corp and Canada. "Royal Bank of Canada" becomes `royal bank of`, and "RBC" stays `rbc`, so nothing joins them by itself. `SEED_ALIASES` in `apps/api/src/companies/seed.ts` lists the other spellings the seed adds, and a subsidiary never goes there. Both the stored alias and the lookup go through the same function, so the odd form still matches.

A name that normalizes to nothing (" Inc. ") is rejected, not stored.

The seed makes a Company of every CSV row. A row becomes a Watched company only when `verified` is `yes` and its ATS is greenhouse, lever, ashby, smartrecruiters or workday. SuccessFactors, Dayforce, iCIMS and the other ATSes in the CSV have no public JSON board API, so those rows stay plain Companies even when verified. A Workday slug is `tenant.wdN/site`, taken from the row's URL by the seed, because the polling host needs the data centre.

Some slugs in the CSV are copied from board URLs and arrive percent-encoded, such as Ashby's `PAR%20Technology`. The board adapters decode a slug before encoding it into the API URL (`slugPath`), so the API is called with `%20`, not `%2520`. The listing key keeps the slug as stored, which is also what `parseListingKey` reads from the job URL.

Tests run against a `<database>_test` database that `test/global-setup.ts` creates and migrates. Docker Compose Postgres must be up, and the shell must run Node 22 (see [Toolchain version pins](toolchain-version-pins.md)).

`findSimilarCompanies` scores every alias with bigram Dice at 0.8 or more. It loads all aliases, which is fine at about 100 Companies. Move it to `pg_trgm` if the table grows past a few thousand.

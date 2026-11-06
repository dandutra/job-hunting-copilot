---
type: gotcha
title: Master profile schema package
description: How packages/master-profile validates, what it reports before it stops, and what fitSummary leaves out.
tags: [tailoring, privacy]
sources: ["#26", "#82"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-04T08:40:00-05:00
---

`packages/master-profile` owns the schema (zod), `validateProfile(text)`, `fitSummary(profile)` and `traceCheck(profile, draft)`. The API import and the Tailoring code are meant to depend on it.

- Validation runs in two passes. The schema pass reports bad shapes, tags and empty evidence. The cross-check pass (duplicate IDs, unknown or Do-not-claim references, retired citations, unlisted sources) runs only when the schema pass is clean, so fixing a tag can reveal a duplicate ID.
- A `parent` must be an Experience, Project or Education. `related` and Skill `evidence` must be Facts. A retired Entry may cite retired Entries, but a live one may not.
- `fitSummary` also leaves out retired Skills, Skill aliases, `rules` and `ownership_note`, beyond the fields the ticket names.
- `main` points at `src/index.ts`, so the package is source-only. The API compiles to CommonJS, so it needs a build step or a bundler setting before it can import this package. #57 must add one before it can call `traceCheck`.
- `pnpm profile:check` exits 1 on a missing `data/master-profile.yaml`. That is the expected result on a fresh clone.
- TypeScript stays on 6 here too. `pnpm add -D typescript` installs 7.
- `traceCheck(profile, draft)` takes a `TailoredDraft` and returns a pass or every failing line with its rule (1 to 5). Rule 6 (latest profile version) stays with the caller.
- A failure holds a location and, for a known Entry, its ID. An unknown ID is draft text that may be prose, so it is reported as "an unknown ID". Failures are safe to log.
- `traceCheck` takes `unknown` and parses it with `TailoredDraftSchema` itself, so it never throws. A malformed draft fails with rule `"shape"`, and the detail is the zod issue code alone, because zod messages can quote the bad value. #57 can reuse the schema for its request DTO.
- A bullet may cite only Facts. Citing an Experience, Project, Education or Skill from a bullet fails rule 3. The summary and the cover letter may cite any live Entry.
- A fixed Experience must be listed in the draft with no bullets. Any bullet under it counts as rewording (rule 5), and leaving it out counts as dropping it.
- `related` holds Fact IDs, so for rule 3 a Fact from another Entry is allowed when its `related` names a Fact under the bullet's own Entry.

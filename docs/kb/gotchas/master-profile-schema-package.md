---
type: gotcha
title: Master profile schema package
description: How packages/master-profile validates, what it reports before it stops, and what fitSummary leaves out.
tags: [tailoring, privacy]
sources: ["#26"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-04T08:40:00-05:00
---

`packages/master-profile` owns the schema (zod), `validateProfile(text)` and `fitSummary(profile)`. The API import and the Tailoring code are meant to depend on it.

- Validation runs in two passes. The schema pass reports bad shapes, tags and empty evidence. The cross-check pass (duplicate IDs, unknown or Do-not-claim references, retired citations, unlisted sources) runs only when the schema pass is clean, so fixing a tag can reveal a duplicate ID.
- A `parent` must be an Experience, Project or Education. `related` and Skill `evidence` must be Facts. A retired Entry may cite retired Entries, but a live one may not.
- `fitSummary` also leaves out retired Skills, Skill aliases, `rules` and `ownership_note`, beyond the fields the ticket names.
- `main` points at `src/index.ts`, so the package is source-only. The API compiles to CommonJS, so it needs a build step or a bundler setting before it can import this package.
- `pnpm profile:check` exits 1 on a missing `data/master-profile.yaml`. That is the expected result on a fresh clone.
- TypeScript stays on 6 here too. `pnpm add -D typescript` installs 7.
- `traceCheck(profile, draft)` takes a `TailoredDraft` and returns a pass or every failing line with its rule (1 to 5). Failures hold IDs and locations, never draft text, so the caller can log them. Rule 6 (latest profile version) stays with the caller.
- A fixed Experience must be listed in the draft with no bullets. Any bullet under it counts as rewording (rule 5), and leaving it out counts as dropping it.
- `related` holds Fact IDs, so for rule 3 a Fact from another Entry is allowed when its `related` names a Fact under the bullet's own Entry.
- The CommonJS API still cannot import the package. #57 must add a build step or bundler setting first.

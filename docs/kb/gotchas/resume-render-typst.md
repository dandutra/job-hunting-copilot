---
type: gotcha
title: Resume render package and Typst
description: Installing the pinned Typst, how CI checks it, and what packages/resume-render does that its code does not explain.
tags: [resume, rendering, ci]
sources: ["#41"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-18T14:50:00-05:00
---

`packages/resume-render` turns the typed resume model into a PDF (Typst CLI) and a DOCX (`docx` package).

## Typst install

- The pinned version is in `packages/resume-render/typst-version` (0.15.1). Download the release tarball from github.com/typst/typst/releases (`aarch64-apple-darwin` on the Mac) and put `typst` on `PATH`. `pnpm check` and the package tests need it and fail with a message naming the version otherwise.
- `ci.yml` installs Typst from `typst-version` and checks the sha256 in `typst-linux-x64.sha256`. A version bump must update both files. Typst publishes no checksum file, so the checksum was computed from the downloaded release (trust on first use).
- Typst is pre-1.0, so an upgrade reruns the contract test and needs review.
- `GITHUB_PATH` applies only to later steps, so a step that installs Typst cannot call it in the same step (found in review).

## Rendering

- Both renderers take fields from `viewOf` by name, so a stray property on the model never prints.
- Dates go through one `formatDates` function: `Mon YYYY - Mon YYYY` or `Present`.
- The working folder is a `mkdtemp` under `TMPDIR`, removed in `finally`.
- The long-URL guard is Typst `box()`. The test reads PDF text by line, because joined text hides a wrap.
- PDF `creator` is Typst's own and cannot be set. DOCX sets `lastModifiedBy`.
- Liberation Sans 2.1.5 TTFs live in `fonts/` with their OFL `LICENSE`, from the GitHub release attachment.

## Model and template

- `phone` is optional in the model.
- Template section order is Experience, Projects, Education, Skills, Volunteer Experience. Highlights of Qualifications is not in the model yet.

## Docker

The package builds to CommonJS `dist/`, but reads `src/resume.typ`, `fonts/` and `typst-version` from the package folder. A Docker image that copies only `dist/` must copy those too (relevant to #42).

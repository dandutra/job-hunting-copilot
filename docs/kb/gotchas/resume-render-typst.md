---
type: gotcha
title: Resume render package and Typst
description: Installing the pinned Typst, how CI checks it, and what packages/resume-render does that its code does not explain, for the resume and the cover letter.
tags: [resume, cover-letter, rendering, ci]
sources: ["#41", "#60", "#43", "#42"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-19T12:00:00-05:00
---

`packages/resume-render` turns the typed resume model and the Tailored cover letter into a PDF (Typst CLI) and a DOCX (`docx` package).

## Typst install

- The pinned version is in `packages/resume-render/typst-version` (0.15.1). Download the release tarball from github.com/typst/typst/releases (`aarch64-apple-darwin` on the Mac) and put `typst` on `PATH`. `pnpm check` and the package tests need it and fail with a message naming the version otherwise.
- The composite action `.github/actions/install-typst` installs Typst from `typst-version` and checks the sha256 in `typst-linux-x64.sha256`. Both `ci.yml` and the `check` job of `deploy.yml` use it, because each runs `pnpm check`. #108 added it to `ci.yml` only, and the first deploy after the merge failed on it. The `typst` stage of `apps/api/Dockerfile` reads the same two files, so a version bump or checksum change moves CI, the deploy check job and the image together, and a bump must update both files. The artifact URL and tar member are written twice, in the composite action and in the Dockerfile, so a release layout change needs both. Typst publishes no checksum file, so the checksum was computed from the downloaded release (trust on first use).
- Typst is pre-1.0, so an upgrade reruns the contract test and needs review.
- `GITHUB_PATH` applies only to later steps, so a step that installs Typst cannot call it in the same step (found in review).

## Rendering

- The resume renderers take fields from `viewOf` and the letter renderers from `letterViewOf`, both by name, so a stray property on the model never prints. Both share `contactView`.
- Resume dates go through `formatDates`: `Mon YYYY - Mon YYYY` or `Present`. The letter date goes through `formatLetterDate` ("November 19, 2026") and rejects a day the month lacks.
- The working folder is a `mkdtemp` under `TMPDIR`, removed in `finally`.
- The long-URL guard is Typst `box()`. The test reads PDF text by line, because joined text hides a wrap.
- PDF `creator` is Typst's own and cannot be set. DOCX sets `lastModifiedBy`.
- Liberation Sans 2.1.5 TTFs live in `fonts/` with their OFL `LICENSE`, from the GitHub release attachment.
- All four renderers (resume and letter, PDF and DOCX) must stay `async function`. A one-line arrow such as `(m) => compile(..., viewOf(m))` runs the view before any promise exists, so a bad date throws synchronously instead of rejecting (found in review of #60). The test "rejects every renderer instead of throwing" guards it. Date validation therefore runs before the Typst version check.

## Model and template

- `phone` is optional in the model.
- Template section order is Experience, Projects, Education, Skills, Volunteer Experience. `ResumeModel.highlights` prints first under its own heading in both renderers.
- Project bullets are not printed (template rule 4). A bullet the user reviews under a Project never reaches the file, although `/tailor` still writes 2 to 3 per Project.
- Volunteer Experiences print under their own heading in the file, while the review screen lists them under Experience.

## Cover letter

- `letter.typ` mirrors the page, font and link rules of `resume.typ` by comment only, because Typst set rules do not cross an import. A change to one must go to the other. The tests cover only the letter's page size, hyphenation and the banned-construct scan.
- The model's `signOff` is the closing phrase only. Both renderers print the contact name under it, so the name appears twice, in the contact block and in the signature.
- The letter has no headings, so template rules 3 and 4 do not apply to it.
- Known gap, not fixed: a paragraph containing `\n` prints as separate lines in the PDF (Typst reads the newline) and as a space in the DOCX (`docx` writes it raw inside `<w:t>`). The tests miss it because they collapse whitespace. The `/tailor` skill must not emit newlines inside a paragraph until this is handled.
- The contract test "fails when a paragraph is dropped" edits extracted text, so it proves only that `assertInOrder` catches a drop. Dropping a paragraph in either real template was checked by hand and failed the contract test, but no committed test does that.

## Docker

The package builds to CommonJS `dist/`, but reads `src/resume.typ`, `src/letter.typ`, `fonts/` and `typst-version` from the package folder. `compile(name, data)` in `render-pdf.ts` copies `src/<name>.typ` and writes `<name>.json`. A Docker image that copies only `dist/` must copy both templates too.

`apps/api/Dockerfile` builds the package and copies `dist/`, both templates, `fonts/`, `typst-version` and `package.json`. Its `typst` stage reads `typst-version` and `typst-linux-x64.sha256`, downloads the x86_64 musl release, checks the sha256, and the runtime stage copies `/usr/local/bin/typst`. Approve therefore no longer answers 500 for lack of the binary (#42).

The stage refuses to build on anything but x86_64 (`uname -m`), because only an x86_64 checksum exists. On an arm64 Mac build with `--platform linux/amd64`. Compose builds on the ubuntu-24.04 runner and the Droplet only pulls, so CI and deploy never hit the guard.

## Render smoke in CI

- The `smoke` job in `ci.yml` runs `scripts/smoke-render.sh <image>` after the compose build. It mounts `scripts/smoke-render.cjs` into the built API image, renders a fake resume and letter to PDF and DOCX, checks the magic bytes and size, and prints the container's peak memory from cgroup `memory.peak` (page cache included).
- The model is inline in `smoke-render.cjs` because the image has no test fixtures. A change to the model must update it.
- The build job of `deploy.yml` does not run this smoke. Only `ci.yml` does.

## Measurements

Dated 2026-11-19, with the x86_64 image under emulation on an arm64 Mac, not native:

- Extracted text of the one-page resume, the two-page resume and the letter is identical between Typst 0.15.1 on arm64 macOS and on x86_64 Linux (compared with unpdf). The PDF bytes differ only by timestamps and document IDs.
- Max RSS of one two-page resume render (`/usr/bin/time -v`): 47 MB in 0.23 s.
- The in-image smoke (node plus Typst, four renders, page cache included) peaked at 135 MiB. The Droplet has 2 GiB, so a render is not a memory risk.

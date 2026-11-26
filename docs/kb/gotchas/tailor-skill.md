---
type: gotcha
title: The /tailor skill
description: How the default local /tailor flow and its tailor.mjs subcommands check the profile, the draft and the saved .docx, what bites in them, and what stays in --api mode.
tags: [tailoring, privacy]
sources: ["#59", "#110", "#149"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-26T12:00:00-05:00
---

`.claude/skills/tailor/` holds `SKILL.md` (local mode, three gates), `references/api-mode.md` (read only with `--api`) and `scripts/`. `/tailor` is local by default and `--api` opts into the old flow. The scripts run from the repo root and read `COPILOT_API_URL` from `.env`, as `/tailor-review` does. The skill is pinned to Sonnet, and its `allowed-tools` covers its own scripts and edits under `data/tailored/` and `data/tailor-examples/`, so a run raises few permission prompts.

`scripts/tailor.mjs` has five subcommands: `hash`, `posting <id> [<folder>]`, `trace <folder> <scratchpad>`, `build <folder>` and `orphans <folder>`. `fetch-input.sh`, `api.sh` and `page-count.sh` are `--api` only.

Local mode
- `tailor.mjs hash` compares the SHA-256 of `data/master-profile.yaml` with `version` from `GET /master-profile/latest` and exits 3 on a mismatch. `fetch-input.sh` does the same for `--api` and also deletes the fetched input. See [Master profile import](master-profile-import.md).
- A gate enforced in one subcommand can be skipped. `build` re-runs the Trace check and the `fixed.md` check because an edited `draft.json` can reach it without `trace`. It does not re-run the blind review, so the skill runs `trace` and `/tailor-review` again after every gate change.
- `draft.json` carries `skillGroups`, never `skills`, plus `company` and `role`. `readDraft` in `tailor.mjs` strips all three before the Trace check and flattens `skillGroups` into `skills`, so the check sees the API's draft shape. A top-level `skills` is refused. `company` and `role` feed only the cover letter's greeting and `Re:` line.
- `fixed.md` starts with `<!-- E.. cites: F.. -->`. One block covers every fixed Experience and is inserted where the first fixed ID is listed. The block needs a `- ` bullet, and each cited Fact must be live and sit under a fixed Experience. `build` copies the block's lines as written and does not derive them from the Facts, so a fixed Experience stays untouched by the model, as the decision requires. Its header's Facts become the `cites` of the block's bullet, which is how the blind review gets Facts to read it against.
- `posting <id>` with no folder derives `data/tailored/<company>-<title>`. A Thin Posting prints `thin` after the folder path, and its `posting.txt` holds only the snippet (live check: Postings 1, 2, 3 and 10 were thin, 50 was not).
- The review packet goes to the scratchpad, never into the folder holding `posting.txt`, and `trace` refuses that. `/tailor-review` accepts a path ending in `review-packet.json` and posts nothing.
- `orphans` compares the saved `.docx` with the rendered `draft.json` after it normalises quotes, dashes and spaces. A Skills line with items deleted counts as a cut, even with a trailing comma. Any other differing line is unmatched and exits 1. A Skill is orphaned when none of its evidence Facts is cited by a surviving line.
- `orphans` re-renders with today's month, so an Education `Expected` date can differ when `build` and `orphans` run in different months.
- `scripts/docx.mjs` builds the `.docx` from `draft.md` with the `docx` package, a root devDependency for this script. It marks each file `lastModifiedBy: tailor build`. Word rewrites that field on save, so a different value means the user edited the file, and the build exits 4 until `--force`. It strips the zip's folder entries, which Word has refused through cloud co-editing (Anthropic's docx skill).
- `tailor.mjs` loads `traceCheck` from `packages/master-profile/dist`, so `tailor.test.mjs` needs that package built. In the root `pnpm check` the `pnpm generate:check` step builds it, and `tailor.test.mjs` runs after that step. Moving the test earlier fails on a fresh clone with "packages/master-profile/dist is missing".
- `data/tailor-examples/` (`TEMPLATE.md`, `fixed.md` and three reference drafts) is gitignored and has no history, so it needs the user's own backup.
- The docx-js defaults ship Caption and Footnote styles below 11 pt. They never render because no paragraph names them, so the 11 pt test checks the document's runs and the default size, not every style.

Both modes
- `summary` is a list of lines, one per Highlight, named `summary[0]`, `summary[1]` and so on. Until #59 it was one line holding every Highlight, so one verdict covered all of them and the Trace check couldn't tell which Fact backed which Highlight. The API reads and approves a draft stored in the old shape by wrapping its summary in a list.
- `/tailor-review` runs as a fork from the repo root, so it reads the repo's `.env` whatever directory `/tailor` ran in. `/tailor` passes its own API base as the second argument. A test against a local API without that argument reached the live API.
- The skill's cover letter check is a reading of the Posting text, not a rule in the API.
- Rule 3 is one-way. A bullet may cite a Fact from another Entry only when that Fact's own `related` lists a Fact under the bullet's Experience or Project.
- Reject notes in the tailoring input hold line locations, not text. `--api` fetches `GET /tailored-resumes/<resumeId>` to see the rejected wording. Only `/tailor-review` must stay blind to the Posting.

`--api` mode
- `scripts/page-count.sh` asks Word for the page count over AppleScript, because the PDF comes from Word and other engines break lines differently. It opens the file with `open -a`, since an AppleScript `open` raises Word's Grant Access dialog. Word names documents by HFS path, and `POSIX path of` fails inside a Word `tell` block, so the script compares HFS paths. It is macOS-only and stays out of `pnpm check`. Local mode has the user count pages in Word.
- The API draft shape is a strict object, so it cannot carry the section order or a header that cites the research notes (lessons 1 and 4 of #59). The section order Highlights, Experience, Projects, Skills, Education belongs to the renderer (#41). Local `draft.json` adds `company`, `role` and `skillGroups`, which `readDraft` removes before the Trace check.

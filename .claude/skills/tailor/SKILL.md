---
name: tailor
description: Write a draft Tailored resume, and a Tailored cover letter when asked, for one Posting. Use when the user runs `/tailor <Posting ID>` or `/tailor <pasted description>`, or asks to tailor a resume for a Posting.
argument-hint: [<Posting ID> | <pasted description>] [--cover-letter] [--api]
# The Trace check and the blind Claim review gate every line, so Sonnet writes the draft (#110).
model: sonnet
allowed-tools:
  - Bash(node .claude/skills/tailor/scripts/tailor.mjs:*)
  - Bash(node .claude/skills/tailor/scripts/docx.mjs:*)
  # --api mode only
  - Bash(.claude/skills/tailor/scripts/fetch-input.sh:*)
  - Bash(.claude/skills/tailor/scripts/api.sh:*)
  - Bash(.claude/skills/tailor/scripts/page-count.sh:*)
  - Edit(data/tailored/**)
  - Edit(data/tailor-examples/**)
---

Write a draft Tailored resume for `$ARGUMENTS`: a Posting ID or a pasted Posting description, then optionally `--cover-letter`. With `--api`, read `references/api-mode.md` and follow it instead of this file.

Nothing is submitted, reviewed or approved in the app. The API is read for the profile version and, with an ID, the Posting. Terms (Entry, Fact, Do-not-claim, Thin Posting) are in `docs/kb/glossary.md`. Why the checks are split this way is in `docs/kb/decisions/tailoring-is-gated-by-the-api.md`.

## Before writing

Read `data/tailor-examples/`: `TEMPLATE.md` (the shape and its Lessons), `fixed.md` and the reference `draft.md` files. When it is missing, stop and tell the user. Never put personal values from the profile in a committed file.

Each shell call starts fresh, so run every command from the repo root. `<scratchpad>` is the directory named in your system prompt (`$TMPDIR` if it names none).

## Steps

1. Run `node .claude/skills/tailor/scripts/tailor.mjs hash`. Exit 3 means `data/master-profile.yaml` is not the latest stored version: stop and tell the user to run `pnpm profile:import`. If that import says the version was already stored, the local file is an older version, and the user must restore the latest one. Any other failure: report the printed error and stop.

2. Make the folder `data/tailored/<company>-<role>/` and write `posting.txt` in it. A first argument that is a whole number is a Posting ID: `node .claude/skills/tailor/scripts/tailor.mjs posting <id>` creates the folder, writes `posting.txt` and prints the folder path. Anything else is the pasted description: choose a kebab-case folder name and write the pasted text to `posting.txt`.
   - A second printed line `thin` is a Thin Posting. Ask the user to paste the full description, write it to `posting.txt`, and use it as the Posting text from here on.
   - An existing folder is a revision: read its `draft.json` first and start from it.
   - When `--cover-letter` is absent and the Posting text mentions a cover letter, tell the user before writing. They may re-run with the flag.

3. **Gate 1.** Read the Posting and tell the user, then wait for the user to approve or iterate. The theme sets the order of every section, so never skip this step or guess it.
   - The stack: full-stack, back end, front end, DevOps, cloud or operations, with the Posting lines that show it.
   - Any second angle the Posting stresses, such as AI-assisted development, with its lines.
   - The stretch lines. List the hard requirements ("must have", "you'll need") the profile does not plainly meet. A requirement with no related Fact stays out, and nothing is written for it. A requirement with a related Fact gets the strongest line that Fact supports, shown with its requirement and its Facts. The line never claims the requirement itself. Only the lines the user accepts enter the draft.

   Example: the Posting asks for "Java or a functional programming language", and a Fact says the candidate wrote an app in Go. Go is related, but it is not a functional language. A stretch line may feature the Go work. It never calls Go functional and never mentions Java.

   The contact details are current: the user keeps them up to date in the profile.

4. **Gate 2.** Choose Facts and write `<folder>/draft.json` by `TEMPLATE.md` and the rules under Writing. Print every line in the order it will appear on the page: each section runs from the strongest fit to the theme and angles to the weakest. Wait for the user to approve or iterate.

5. **Gate 3.** Run `node .claude/skills/tailor/scripts/tailor.mjs trace <folder> <scratchpad>`.
   - Each failure prints as `rule location detail`. Fix those lines in `draft.json` and run it again.
   - On success, run `/tailor-review <scratchpad>/review-packet.json`. It judges the lines blind and prints the flagged ones. Rewrite those lines and nothing else, then run both commands again. After 2 rewrite rounds with lines still flagged, stop and show the user the draft and the verdicts.
   - Print the reviewed lines in the Gate 2 order, and wait for the user to approve or iterate.

6. Run `node .claude/skills/tailor/scripts/tailor.mjs build <folder>` (add `--cover-letter` when asked). It renders `draft.md`, then builds the `.docx`. The user cuts lines in Word to fit one page with nothing below 11 pt, and the weakest lines are already at the bottom of each section. Exit 4 means the user saved the `.docx` in Word after the last build. Build with `--force` only when the user asks, because it replaces their edits.

7. When the user says the cuts are done, run `node .claude/skills/tailor/scripts/tailor.mjs orphans <folder>`. It lists each Skill whose evidence Facts no longer appear on the page. An exit 1 with an `unmatched` line means the user reworded a line in Word, and `draft.json` does not carry that back. Print the line, ask for the rule behind the edit, and offer it for `TEMPLATE.md`.

## Iterating on the template

The final `.docx` needs only cuts, so the gates are where wording gets fixed. At each gate, when the user's change is a rule rather than a one-off for this Posting, propose it as a line under Lessons in `data/tailor-examples/TEMPLATE.md`, and write it once the user says yes.

## Writing

`draft.json` is the draft shape below plus three local fields, which the Trace check never sees. `skillGroups` holds the Skills lines, and the script flattens it into `skills`.

```json
{
  "company": "Acme",
  "role": "Backend Developer",
  "summary": [{"text": "...", "cites": ["F1"]}, {"text": "...", "cites": ["F4"]}],
  "experiences": [{"id": "E1", "bullets": []}, {"id": "E2", "bullets": [{"text": "...", "cites": ["F2"]}]}],
  "projects": [{"id": "P1", "bullets": []}],
  "educationIds": ["ED1"],
  "skillGroups": [{"label": "Languages", "skills": [{"skillId": "S1", "text": "TypeScript"}]}],
  "coverLetter": [{"text": "...", "cites": ["F2"]}]
}
```

- **Cite.** Every line has `cites`: Entry IDs. A bullet cites only Facts, and only Facts under its own Experience or Project, unless the cited Fact's own `related` lists a Fact under that Experience or Project. A link in the other direction does not count. A Fact is cited only on a surface its `use` allows. Cite no retired Entry or Do-not-claim.
- **Claim only what a cited Fact states.** No number, scope, ownership or tool beyond it. Respect each Fact's `ownership` (`team` is never "led" or "built alone"). State a result only when a Fact does. Write no Do-not-claim, even when a Fact seems to support it.
- **Posting wording.** Use it only when it matches a Skill's name or alias, or a cited Fact supports it. Add no hidden text or keyword lists.
- **Plain words.** Write for a hiring manager who may not know the tools. Tool names go in Skills and in the "how" part of a bullet, where the reader would know them. Flag any proper noun the reader cannot decode (an internal project name) to the user at Gate 2.
- **Skills.** Each skill's `text` is the exact `name` or one alias of its `skillId`. Every Skill listed has a line that shows it.
- **Fixed Experiences.** List every `fixed: true` Experience in `experiences` with `bullets: []`. `fixed.md` holds their block, and the build inserts it where the first of them is listed.
- **Program names.** Reproduce no bracketed acronym from a program name (`docs/kb/gotchas/workday-resume-parsing.md`). Reword a compound that could break at a line end.
- **Cover letter.** With `--cover-letter`, add `coverLetter`: paragraphs only, each citing Entries. The build adds the date, greeting and sign-off from `company` and `role`.

## Form outputs

After step 7, read the saved resume with `node .claude/skills/tailor/scripts/docx.mjs text <the .docx>` and print for the user, citing Facts:

- The Skills list to type into the application form, from the Skills lines minus the orphaned Skills, because Workday does not fill Skills from a resume.
- A role description for each Experience still on the page: plain prose about the work, led by the Posting's theme from Gate 1, from its cited Facts only.

## Report

Print the folder path, the review flags per round, the rewrite rounds used, the lines cut (the Gate 3 lines missing from the saved text) and the orphaned Skills. End with what the user must still do: export the PDF from Word and apply.

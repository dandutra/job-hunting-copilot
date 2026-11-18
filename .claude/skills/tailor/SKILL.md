---
name: tailor
description: Write a draft Tailored resume, and a Tailored cover letter when asked, for one Posting. Use when the user runs `/tailor <Posting ID>` or asks to tailor a resume for a Posting.
argument-hint: <Posting ID> [--cover-letter] [--local]
# The Trace check and the blind Claim review gate every line, so Sonnet writes the draft (#110).
model: sonnet
allowed-tools:
  - Bash(.claude/skills/tailor/scripts/fetch-input.sh:*)
  - Bash(.claude/skills/tailor/scripts/api.sh:*)
  - Bash(.claude/skills/tailor/scripts/page-count.sh:*)
  - Bash(node .claude/skills/tailor/scripts/docx.mjs:*)
  - Edit(data/tailored/**)
---

Write a draft Tailored resume for Posting `$ARGUMENTS` (a Posting ID, then optionally `--cover-letter` and `--local`), submit it to the API, and run the Claim review on it. Approval happens only in the app, never here.

With `--local`, read `references/local-mode.md` before step 1. It adds the application folder in `data/tailored/`, `draft.md`, the `.docx` build and the page loop.

The API's Trace check is the only gate on what gets stored, so this skill never validates citations itself. Terms (Entry, Fact, Do-not-claim, Thin Posting) are in `docs/kb/glossary.md`. Why the work is split this way is in `docs/kb/decisions/tailoring-is-gated-by-the-api.md`.

## Before writing

Read `docs/research/canadian-resume-conventions.md` and `docs/research/workday-ats.md`, and `docs/kb/decisions/resumes-follow-canadian-conventions.md`. Recalled conventions were rejected on the first hand-tailored resume. Never put personal values from the profile in a committed file.

Each shell call starts fresh, so run every command from the repo root.

1. If the Posting ID is not a whole number, stop and ask. Fetch the input into the scratchpad directory named in your system prompt (`$TMPDIR` if it names none):

   ```sh
   .claude/skills/tailor/scripts/fetch-input.sh <id> "<scratchpad>/tailoring-input-<id>.json"
   ```

   Exit 3 means `data/master-profile.yaml` is not the latest stored profile version. Stop before writing and tell the user to run `pnpm profile:import`. If that import says the version was already stored, the local file is an older version, and the user must restore the latest one. Any other failure: report the printed error and stop.

2. Read the file. It holds the `posting`, `profileVersion`, the profile's `experiences`, `facts`, `projects`, `education`, `skills`, `doNotClaims`, and `rejectNotes`.

3. If `posting.thin` is true, ask the user to paste the full description, and wait. Send it as `postingText` in the submit. Use the pasted text as the Posting text for the rest of the run.

4. If `--cover-letter` is absent and the Posting text mentions a cover letter, stop before writing and tell the user. They may re-run with the flag.

5. Analyze the Posting's theme, and wait for the user to confirm it before writing. The theme sets the order of every section and decides which lines are weak, so never skip this step or guess it. Tell the user:
   - The stack: full-stack, back end, front end, DevOps, cloud or operations, with the Posting lines that show it.
   - Any second angle the Posting stresses, such as AI-assisted development, with its lines.
   - The Experiences, Projects and Facts that would lead, and why.
   - Each hard requirement, met or not, with its Facts. Step 7 handles the unmet ones.
   - Any Fact that looks like evidence but is not, such as a product with a similar name, or a tool the Posting gives only as an example.

   The contact details are current: the user keeps them up to date in the profile.

6. Read `rejectNotes`. Each gives a `resumeId`, a note, and the locations of the rejected lines, but not their text. Fetch each rejected draft with `.claude/skills/tailor/scripts/api.sh get <resumeId>` to see the wording.

   Do not repeat the claim, wording or framing of a rejected line.

7. List the Posting's hard requirements (the "must have", "you'll need" items) that the profile does not plainly meet. For each one, look for Facts related to it.
   - No related Fact: leave the requirement out. Write nothing about it, and never make a line up to cover it.
   - A related Fact: draft the strongest line that Fact supports, and never claim the requirement itself. Show these stretch lines to the user before submitting, each with its requirement and its Facts, and submit only the ones they accept.

   Example: the Posting asks for "Java or a functional programming language", and a Fact says the candidate wrote an app in Go. Go is related, but it is not a functional language. A stretch line may feature the Go work. It never calls Go functional and never mentions Java.

## Writing

Write only what needs rewording, in the draft shape below. The API fills employer, titles, dates, education and contact, and every `fixed: true` Experience.

- **Cite.** Every line has `cites`: Entry IDs. A bullet cites only Facts, and only Facts under its own Experience or Project, unless the cited Fact's own `related` lists a Fact under that Experience or Project. A link in the other direction does not count. A Fact is cited only on a surface its `use` allows. Never cite a retired Entry or a Do-not-claim.
- **Claim only what a cited Fact states.** No number, scope, ownership or tool beyond it. Respect each Fact's `ownership` (`team` is never "led" or "built alone"). State a result only when a Fact does. Never write a Do-not-claim, even when a Fact seems to support it.
- **Posting wording.** Use it only when it matches a Skill's name or alias, or a cited Fact supports it. Never add hidden text or keyword lists.
- **Plain words.** Write for a hiring manager who may not know the tools. Plain words in the summary and bullets. Tool names go in Skills and in the "how" part of a bullet, where the reader would know them. Flag any proper noun the reader cannot decode (an internal project name) to the user before submitting.
- **Summary.** `summary` is the Highlights of Qualifications: a list of 4 to 6 lines, one per Highlight. Each names where the skill came from, has no "I", and cites only the Facts behind that Highlight.
- **Bullets.** Action, then how, then result, no "I". Canadian spelling. Dates are the API's.
- **Order.** The Posting's main theme leads the highlights and each entry's bullets. Every Skill listed has a bullet that shows it.
- **Skills.** Each `skills[]` line is a Skill's `id` and its exact `name` or one alias.
- **Entries.** List every `fixed: true` Experience in `experiences`, each under its own ID with `bullets: []`. Leaving one out fails the Trace check. Choose other Experiences and Projects by the Posting's theme. Put education IDs in `educationIds`.
- **Cover letter.** With `--cover-letter`, add `coverLetter`: paragraphs only, each citing Entries. The API builds the greeting and sign-off.
- **One page, always.** The rendered resume is one page, with no exceptions. Write to fit: 4 or 5 Highlights unless the page has room for a sixth, at most 5 bullets for the main Experience and 3 for any other, 2 or 3 bullets per Project, and each bullet under about 200 characters. The number of Projects has no cap: include every Project that relates to the stack, in order of fit, and the page check decides how many stay. When the content does not fit, leave out the weakest lines. Never let a draft run to a second page.
- **Weakest line.** Use the stack from step 5. A line unrelated to that stack is weak, and goes first. When every line relates to the stack, keep work experience over projects, and projects over education. Experience and Project bullets are cut first. A Highlight is cut only when no bullet is left to cut, and the Highlights never drop below 4. The user approves every line left out.
- **Program names.** Do not reproduce a bracketed acronym from a program name (`docs/kb/gotchas/workday-resume-parsing.md`). Avoid a compound that could break at a line end; reword it.

Draft shape (`profileVersion` is the input's):

```json
{
  "profileVersion": "<hash>",
  "summary": [{"text": "...", "cites": ["F1"]}, {"text": "...", "cites": ["F4"]}],
  "experiences": [{"id": "E1", "bullets": [{"text": "...", "cites": ["F2"]}]}],
  "projects": [{"id": "P1", "bullets": []}],
  "educationIds": ["ED1"],
  "skills": [{"skillId": "S1", "text": "..."}],
  "coverLetter": [{"text": "...", "cites": ["F2"]}],
  "postingText": "only for a Thin Posting"
}
```

## Submit

Write the JSON fresh to `<scratchpad>/draft-<id>.json`, then:

```sh
.claude/skills/tailor/scripts/api.sh submit <id> "<scratchpad>/draft-<id>.json"
```

A 201 returns the draft ID. On 422 the body lists `{ rule, location, detail }` for each failing line: fix those lines and submit again. Rule 6 means the profile changed, so run step 1 again. Count the failures per submit for the report.

## Claim review

Run `/tailor-review <draft ID> <base>` on the new draft, where `<base>` is `COPILOT_API_URL` from `.env`, the API the submit reached. The review runs as a fork from the repo root, so without `<base>` it reads the repo's `.env` and may reach a different API. It runs blind to the Posting. If lines are flagged, rewrite those lines (and nothing else) from the verdict notes, submit a new draft, and review it. After 2 rewrite rounds with lines still flagged, stop and show the user the draft and the verdicts.

A draft that only removes lines from a reviewed draft skips the review, because every line left was already judged. The Trace check still runs on its submit.

## User changes

A change the user asks for in the conversation produces a new draft. So does an edit the user made in a draft or a rendered file, even a hand edit to a PDF or DOCX: copy the edit into a new draft first, because only the draft carries citations. Re-read the user's latest file before each revision, and start from their version. For any line with no citation, ask which Facts back it, or whether to add the Fact to the Master profile. Submit, then run `/tailor-review` as for any draft.

## Form outputs

After the draft is stored, print for the user, citing Facts:

- The Skills list to type into the application form, because Workday does not fill Skills from a resume.
- A role description for each chosen Experience: plain prose about the work, led by the Posting's theme from step 5, from its cited Facts only.

## Check the page

The resume is one page with every line of text at 11 pt or more. Word's page count decides, because two estimates were wrong and the user exports the PDF from Word. With `--local`, the page loop in `references/local-mode.md` counts and cuts. Without it, count a rendered `.docx` with `.claude/skills/tailor/scripts/page-count.sh <file>`, and when none exists, say the page count is unchecked. Over one page, the font stays at 11 pt and lines go, one at a time, by the weakest-line rule.

## Report

Print the draft ID and status, the stretch lines the user accepted, then three numbers: Trace check failures per submit, Claim review flags per round, rewrite rounds used. With `--local`, add the page count, the lines cut to reach it, and the folder path. End with what the user must still do: read the draft beside its cited Facts and approve it in the app.

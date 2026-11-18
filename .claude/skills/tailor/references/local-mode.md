# Local mode

With `--local`, the run also produces the files the user sends, in one folder per application. Everything in `SKILL.md` still applies: the theme, the stretch lines, the Trace check and the Claim review. This file adds the folder, `draft.md`, the build and the page loop.

## The folder

`data/tailored/<company>-<role>/`, kebab-case, for example `acme-backend-developer`. It holds these files and nothing else:

- `posting.txt`: the Posting text, written at the start of the run (the pasted text for a Thin Posting).
- `draft.md`: the resume as text, overwritten on every revision.
- `<Name>-Resume.docx`, and `<Name>-Cover-Letter.docx` with `--cover-letter`, built by the script.

Draft JSON and API responses go to the scratchpad. The user exports the PDF from Word.

If the folder already exists, this is a revision: read `draft.md` first. Its first line, `<!-- draft <ID> -->`, names the stored draft, and `scripts/api.sh get <ID>` returns its lines with their citations. Start the new draft JSON from that one.

## draft.md

Write `draft.md` from `scripts/api.sh get <draft ID>` on the reviewed draft, because that response carries the contact, employers, titles, dates and education the API filled in. Sections go in this order, with these names:

```markdown
<!-- draft 123 -->
# Alex Example
Toronto, ON · 416-555-0100 · [alex@example.com](mailto:alex@example.com) · [github.com/alex](https://github.com/alex)

## Highlights of Qualifications
- One line per Highlight, in the draft's order.

## Experience
### **Developer**, Example Co, Toronto, ON | Jan 2024 – Present
- One line per bullet.

## Projects
### **Tool** · [github.com/alex/tool](https://github.com/alex/tool)
- One line per bullet.

## Technical Skills
**Languages:** TypeScript, Python

## Education
### **Computer Programming**, Example College | Expected Dec 2026

# Cover letter
November 18, 2026

Hiring Team
Example Co

**Re: Developer**

Dear Example Co hiring team,

One paragraph per cover-letter line.

Sincerely,
Alex Example
```

- `### lead | dates` prints the dates against the right margin. The bold part is the title, program or project name.
- Dates are `Mon YYYY – Mon YYYY` with an en dash, or `Present`.
- `**bold**` and `[text](url)` are the only inline marks. The Skills lines group the draft's `skills[]` texts under short bold labels, and every grouped text is one of the draft's.
- `# Cover letter` appears only with `--cover-letter`. Lines with no blank line between them form one block; the greeting and sign-off are the API's.
- `draft.md` reads as clean resume text. The citations live in the stored draft.

## Build

```sh
node .claude/skills/tailor/scripts/docx.mjs build data/tailored/<folder>
```

The script fixes the layout: Calibri, US Letter, 0.5 in side margins, nothing below 11 pt. A malformed `draft.md` exits 1 and names the line. Exit 4 means the user saved the `.docx` in Word after the last build: print its text with `docx.mjs text <file>`, copy the edits into `draft.md` and follow "User changes" in `SKILL.md`, then build with `--force`.

## Page loop

```sh
.claude/skills/tailor/scripts/page-count.sh data/tailored/<folder>/<Name>-Resume.docx
```

Word's count is the page count. Exit 3 means the file is open in Word with unsaved edits; ask the user to save or close it.

While the count is above 1:

1. Propose the one weakest line by the weakest-line rule in `SKILL.md`, and wait for the user's answer.
2. Remove the accepted line from `draft.md` and from the draft JSON.
3. Build and count again.

The loop ends at 1 page. Then submit the shorter draft JSON for the Trace check, put the new draft ID on the first line of `draft.md`, and skip the Claim review: the remaining lines are the reviewed ones. Count the cover letter too, and report its count.

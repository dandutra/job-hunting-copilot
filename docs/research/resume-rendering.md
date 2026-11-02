# Rendering a Tailored resume to PDF and DOCX

Research for ticket #14. All sources were read on 2026-11-02. The test resume is fake, and nothing from `data/` was read.

## Summary

1. Use two small renderers fed by one typed model. The Typst CLI writes the PDF and the `docx` npm package writes the DOCX. Both run from a TypeScript package, so the stack keeps its two languages and gains one static binary and a font. Chromium and LibreOffice stay out.
2. Both outputs extract cleanly in every reader I could run. Typst's PDF and the `docx` file each gave 32 of 32 expected strings in order, across 6 PDF readers and 3 DOCX readers. None of those readers is an ATS.
3. No test here touched Workday, Greenhouse or Taleo. No vendor publishes which format parses better, and none names its parser. The claim that output parses cleanly on those three is therefore reasoned from their documented failure causes, not observed.
4. What the vendors do document is layout. Greenhouse lists columns, tables, headers, footers, text boxes and graphics as causes of failed parses. Workday says results vary with "resume format and order of words" and warns against images. Single-column body text meets all of that in either format.
5. Upload rule, at low confidence: PDF on Greenhouse and on anything not named here, DOCX on Workday and Taleo. Greenhouse's "Upload a PDF for best results" is the only first-party format preference I found. The DOCX call rests on a mechanism and on weak sources.
6. Taleo matters less than the ticket suggests: 0 of the 99 companies in the [Watched companies list](https://github.com/dandutra/job-hunting-copilot/issues/3) use it, although a Posting found on LinkedIn or Indeed may still lead to a Taleo form. Workday has 20, Greenhouse 20, SuccessFactors 14, Ashby 14 and Lever 10. The last three were not researched.
7. A manual smoke test on real application forms is the cheapest way to raise confidence, and it is a proposed ticket.

## Confidence

| Claim | Confidence | Basis |
|---|---|---|
| Typst plus `docx` is the right tool for this stack | High | Measured here, plus the size and memory figures below |
| Both outputs are real text in the right order | High | 9 reader runs, and the controls fail as expected |
| Greenhouse, Workday and Taleo extract the right fields from them | Medium, untested | Inferred from their documented failure causes |
| PDF on Greenhouse, DOCX on Workday and Taleo | Low | One first-party line, one mechanism, weak sources |

## Tools compared

| Option | Templates | Adds to the stack | Verdict |
|---|---|---|---|
| Typst CLI for PDF, `docx` for DOCX | Two | One static binary, one font, one npm package | Chosen |
| HTML through headless Chromium, `docx` for DOCX | Two | A browser and its system libraries | Same two templates at far higher cost |
| `docx`, then LibreOffice to PDF | One | A full office suite | One template, but heavy, and not run here |
| Typst, then a converter to DOCX | One | Typlite or pandoc | Typst has no native DOCX output, and forum reports describe lost styles |
| `docx`, plus a pure TypeScript PDF library | Two | No binary | Lines are positioned by hand, and I found only secondary sources on tagging |

Typst has no DOCX export. The options are third-party [Typlite](https://rust-digger.code-maven.com/crates/typlite) or pandoc, and [the Typst forum](https://forum.typst.app/t/exporting-to-docx-combining-pdf2docx-and-pandoc/6644) reports gaps in both. I did not run either.

LibreOffice would give one template, which is its real appeal. The cost is image size: the [Gotenberg 8 image](https://hub.docker.com/r/gotenberg/gotenberg), which bundles LibreOffice and Chromium, is 706 MB compressed for amd64, against 80 MB for [`node:22-slim`](https://hub.docker.com/_/node). A [LibreOffice users-list post](https://www.libreoffice.org/lists/users/2018/msg00489.html) also reports that a tagged-PDF filter option had no effect from `--convert-to`. That post is from 2018 and may be out of date.

Chromium's PDF was as clean as Typst's, so it loses on running cost alone. Puppeteer's [troubleshooting page](https://pptr.dev/troubleshooting) says the bundled browser lacks shared libraries in Docker and calls running without a sandbox "strongly discouraged". Sizes for its image were not published in anything I read.

### Measured cost

Run on an arm64 Mac. These are not Droplet figures, and the Chromium total adds up each process's resident memory, which double-counts shared pages.

| | Typst 0.15.1 | Chromium (Puppeteer) |
|---|---|---|
| Time for one page | 0.08 s | 1.8 to 5.2 s, including browser start |
| Peak memory | 19 MB | 561 to 579 MB across processes |
| Download | 17.5 MB compressed for [x86_64 Linux](https://github.com/typst/typst/releases/tag/v0.15.1) | 586 MB in `~/.cache/puppeteer` on this Mac |

The [Droplet](https://github.com/dandutra/job-hunting-copilot/issues/17) has 2 GiB for Postgres, the API, ingest, JobSpy and the UI. A 500 MB spike on each render is a real risk there, and 19 MB is not.

### Library state

- Typst is [Apache-2.0](https://github.com/typst/typst), at [0.15.1 from 2026-07-17](https://github.com/typst/typst/releases). It is pre-1.0, so a release can change layout or syntax.
- `docx` is [MIT](https://github.com/dolanmiu/docx), at 9.15.1 on npm, and the repository had a push today. Its CommonJS build bundles nanoid, so the ESM-only trouble in [Toolchain version pins](../kb/gotchas/toolchain-version-pins.md) should not apply. I read the build but did not run it under Jest 30.
- `@myriaddreamin/typst-ts-node-compiler` offers in-process Typst at 0.7.0. It is third-party and adds a second version to track. A CLI call through `execFile` is simpler.

## Test results

I rendered one fake one-page resume from JSON with each tool, then checked that 32 expected strings appear in order. The strings are the name, email, links, headings, titles, employers, dates, every line, and the skills.

PDF readers were pypdf 6.21.4, pdfminer.six 20260107, PyMuPDF 2.1, pdfium through pypdfium2 5.14.0, Apache Tika 2.9.2, and a small reader of my own that groups words by baseline. That last one imitates the naive geometric reading [Textkernel describes](https://textkernel.com/learn-support/blog/improving-extraction-from-column-resumes). DOCX readers were python-docx 1.2.0 (body paragraphs only), Tika, and macOS `textutil`.

| Output | Bytes | Readers with 32 of 32 in order | Notes |
|---|---|---|---|
| Typst, Liberation Sans, `--pdf-standard ua-1` | 36,167 | 6 of 6 | Tagged, no images, passes Typst's PDF/UA-1 checks |
| Typst, Libertinus Serif | 26,852 | 6 of 6 | Words with "fi" and "ffi" came out as plain letters |
| Chromium, Arial | 84,346 | 6 of 6 | Tagged |
| `docx`, Arial | 10,524 | 3 of 3 | 7 heading paragraphs, 6 real list items, 0 tables, text boxes, images, hidden runs or header text |

Negative controls, to show the test can fail:

| Control | Result |
|---|---|
| Two-column Typst PDF | The geometric reader broke 6 strings and misplaced 17. The other 5 kept all text, with 8 to 10 strings out of the single-column order |
| Long URL wrapped at its hyphen | Every PDF reader split `https://github.com/example-` from `jordan`, so 1 string was lost in all 6 |
| DOCX with contact details in the Word header | python-docx (body) and `textutil` lost 4 of 32 strings, and Tika kept them |

The wrapped URL was an accident, and it is the most useful result here: the first clean-looking template broke a link in every reader. Each URL must be unbreakable.

The readers do not use PDF tags. They read the content stream or glyph positions. No ATS document I found mentions tags either, so tagged output is cheap but of unknown value to a parser.

Typst printed `#panic("boom")`, `*stars*`, `$x^2$`, `<label>` and `@ref` literally when they arrived as JSON strings and were placed with `#d.line`. Passing data as JSON therefore avoids any escaping work. Building a `.typ` file by string concatenation would not. Typst's file access is [limited to the project root](https://typst.app/docs/reference/foundations/path/).

## What each ATS documents

### Greenhouse

- [Uploads](https://support.greenhouse.io/hc/en-us/articles/360052218132) accept .doc, .docx, .pdf, .rtf and .txt up to 100 MB.
- ["Greenhouse Recruiting can't parse resumes larger than 2.5MB."](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)
- The same article lists these causes of a failed or partial parse: "Complex resumes with tables, headers, and footers", "the name and contact information in the header, footer, or text box", "a columned layout", graphics, spaced-out letters, no clear sections, company names lacking "Inc., Co., LTD, or LLC", and incomplete titles such as "Sr. Account Exec".
- It also lists fake data, such as "Company 1". Fixtures for any real parser test need plausible names.
- A failed parse is not a rejection. The resume "has only been attached to the candidate", and a recruiter enters the details by hand.
- [MyGreenhouse FAQ](https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates): "Upload a PDF for best results." It holds one resume, and the latest upload is used. A Quick Apply with a stale upload would send the wrong Tailored resume.

The PDF line is about MyGreenhouse uploads. It does not say the recruiter-side parser prefers PDF.

### Workday

- The [admin guide](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html) says results "can vary based on resume format and order of words", and that resumes should not contain "images or image-based styles".
- Parsing does not fill the Languages or Skills fields. An employer can hide parsing from external candidates in the job application template.
- That page covers recruiter tasks and states no file types. The only first-party list I found is for the [HiredScore add-on](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/concept--candidate-profiles.html): DOC, DOCX, PDF, RTF and TXT. Workday's Community documentation needs a login.

### Taleo

- The [attachment page](https://docs.oracle.com/en/cloud/saas/taleo-enterprise/22d/otrcg/c-attachment.html) lists PDF, Word and others, and each customer's administrators choose which are allowed.
- [Parsing](https://docs.oracle.com/en/cloud/saas/taleo-enterprise/21c/otrcg/r-supportedlanguages.html) "is delivered using a third party partner service" and "as is". Oracle does not name the partner, and I found no source tying it to Textkernel.
- The [Legacy Recruiting guide](https://docs.oracle.com/en/cloud/saas/taleo-enterprise/21b/otrec/candidate-management.html) caps a parsed resume at "100 kilobytes or the size defined by the system administrator". The general [attachment default](https://docs.oracle.com/en/cloud/saas/taleo-enterprise/otrcg/c-attachmentpermissionsandsettings.html) is 1 MB. Both test outputs fit under 100 KB.
- The same guide says parsing "can detect text in the header and footer", which disagrees with Greenhouse's list and with [Roche's FAQ](https://careers.roche.com/global/en/resume-parsing-faq). Keeping everything in the body is safe either way, and ticket #14 requires it.

These are 21B to 22D documents. I did not read newer ones.

## Which file to upload

| Where | File | Reason |
|---|---|---|
| Greenhouse | PDF | First-party line above, scoped to MyGreenhouse |
| Workday, Taleo | DOCX | A DOCX stores paragraphs in order, while a PDF stores positioned glyphs that a parser must put back in order. Textkernel, a parser vendor, describes that step as where [column layouts go wrong](https://textkernel.com/learn-support/blog/improving-extraction-from-column-resumes) |
| Anything else | PDF | It keeps the layout for a human reader. Not researched per ATS |

The mechanism matters most for layouts we will not use, so a single-column PDF may parse just as well. Being wrong is cheap: the app produces both files, and the choice is made at upload.

## Where the evidence is thin

- Neither Greenhouse nor Workday names a parser, and Oracle says only "partner". Blog claims about who supplies them are unverified.
- Textkernel's column figures, such as well-rendered CVs rising from 62% to 90%, are self-reported, and the post has no date. It sells a parser. Its [format list](https://developer.textkernel.com/TKPlatform/master/file-formats) says image-only PDFs need an optional OCR add-on, which fits the rule against images.
- [Roche's careers FAQ](https://careers.roche.com/global/en/resume-parsing-faq) says ".docx format is the most accurately parsed by ATSs". It is an employer's advice with no ATS named and no data.
- [Enhancv's test](https://enhancv.com/blog/busting-ats-myths/) is the only one whose method I could read. It names one ATS, Indeed's, across 37 templates. Doc and PDF were 95% and 96% for Google Docs, 88% and 85% for Microsoft Office. Enhancv sells resumes and ranked itself first. It suggests a tie, and it covers none of our three.
- Search results also showed vendor figures such as 97% for DOCX against 76% for PDF ([resumeoptimizerpro](https://resumeoptimizerpro.com/blog/why-not-to-use-pdf)) and near parity on Greenhouse ([Jobloo](https://jobloo.co/blog/pdf-vs-word-resume-ats-data/)). I saw only summaries, they conflict, and all of them sell related products. I rely on none of them.
- The claim that 75% of resumes are rejected by ATS has no primary source that I could find. Secondary accounts trace it to a 2012 Preptel pitch. I found no independent or academic study of these parsers.

## Trade-offs of the recommendation

- Two templates can drift. One typed model and one contract test limit this: the test reads text back from both files and compares it with the model.
- Typst is a second template language, and it is not a hiring signal for this portfolio. The template is about 30 lines.
- Typst is pre-1.0. Pin the version and treat an upgrade as a change to review.
- The PDF uses Liberation Sans and the DOCX uses Arial. Liberation Sans is designed to match Arial's metrics, so pages should break alike, but I did not measure that. Liberation is under the SIL Open Font License, so it can ship in the image.

## What this means for the stack

[TypeScript stack with a Python worker](../kb/decisions/typescript-stack-with-python-worker.md) stands, and the Python worker is not involved.

- A new `packages/resume-render` holds the model, both templates and the contract test. It does not import Prisma.
- The model is the renderer's whole input, so a field that is not in it cannot print. It has no Entry IDs, `repo`, `sources`, `rules` or Do-not-claims.
- The API image gains the Typst binary and the font files. No new Compose service is needed, and [ticket #34](https://github.com/dandutra/job-hunting-copilot/issues/34) and [ticket #36](https://github.com/dandutra/job-hunting-copilot/issues/36) need the same pin.
- Call Typst with `execFile`, no shell, `--ignore-system-fonts` and `--font-path`. The working folder holds personal data, so delete it after each render. Finished files go in the database or `data/`, per [Personal data stays out of git](../kb/decisions/personal-data-stays-out-of-git.md).
- Whether the render runs in the API or next to the `/tailor` skill on the Mac is for ticket #15. A pure package works for both.

## Rules for the templates

1. One column. No tables, text boxes, images, Word headers or footers, or hidden text.
2. The contact block comes first in the body and is printed unchanged. Links show their full URL as visible text, and no URL may break across lines.
3. Plain headings: Experience, Projects, Education, Skills, Volunteer Experience. Experience with `type: volunteer` goes only in the last of these. Section order is for ticket #15.
4. Project lines print `name` and `links` only.
5. Set the page to US Letter in both renderers. Turn off hyphenation and justification.
6. Use one date format throughout. Greenhouse lists "differing formats".
7. Set `title`, `author`, `creator` and `lastModifiedBy`. `docx` wrote `lastModifiedBy` as "Un-named" until told otherwise.
8. No Entry ID may appear in the body or the metadata.
9. Keep each file under 100 KB, the smallest documented limit.

Two points go back to the Master profile tickets, #26 and #28. Experience should hold the employer's legal name with its suffix, and the full job title, because Greenhouse lists both as parse failures.

## Consequences for applying

Simplify [accepts PDF, DOC and DOCX up to 5 MB](https://help.simplify.jobs/en/articles/2885221-automatically-parse-resume-information-to-profile). On its free plan a new upload [replaces the current one](https://help.simplify.jobs/articles/0041921-update-your-uploaded-resume), and holding several resumes needs Simplify+. A new Tailored resume per Posting therefore means replacing the upload each time or attaching the file by hand in the form. Ticket #15 should settle this.

## Not verified

- No real ATS read these files. The smoke test below is the fix.
- No field-level parse. I cloned OpenResume to run its parser as a weak proxy, and the session's permission policy refused to run the cloned code. The results above are text extraction only.
- The DOCX was never opened in Word or LibreOffice, so its appearance is unseen. The Typst PDF was checked by eye at 70 dpi.
- Typst ran on arm64 macOS only, not x86_64 Linux and not on the Droplet.
- Two-page resumes were not tested.
- LibreOffice, Typlite, pandoc and pure TypeScript PDF libraries were not run.
- A template with no `@preview` import should make no network call. I inferred that and did not trace it.
- I did not research parsers for SuccessFactors, Ashby or Lever, which cover 38 of the 99 Watched companies.
- The Master profile has no phone number. No source says that fails a parse, though Enhancv's test scored phone as a field.

## Proposed smoke test

Use the real Master profile, off git, on a Posting the user intends to apply to. Upload both files on MyGreenhouse Quick Apply, on a Workday site that shows parsing, and on any Taleo form, then read the prefilled fields and stop before submitting. Record which fields came through, and revise the upload rule from that.

## Appendix: the tested Typst template

```typst
#let r = json("resume.json")
#set document(title: r.title, author: r.contact.name)
#set page(paper: "us-letter", margin: 0.75in, numbering: none)
#set text(font: "Liberation Sans", lang: "en", region: "ca", size: 10.5pt, hyphenate: false)
#set par(justify: false, leading: 0.55em)
#show heading.where(level: 1): set text(size: 16pt)
#show heading.where(level: 2): set text(size: 11.5pt)
#let links(ls) = ls.map(l => box(l)).join(" | ")
= #r.contact.name
#r.contact.city | #r.contact.email | #links(r.contact.links)

#let job(j) = [
  #block(above: 0.8em, below: 0.3em)[*#j.title*, #j.org \ #j.location | #j.dates]
  #list(..j.lines.map(l => [#l]))
]
== Experience
#for j in r.experience { job(j) }
== Projects
#for p in r.projects [ #p.name | #links(p.links) \ ]
== Education
#for d in r.education [ *#d.program*, #d.school | #d.dates \ ]
== Skills
#r.skills.join(", ")
== Volunteer Experience
#for j in r.volunteer { job(j) }
```

`box(l)` is what keeps a URL on one line. The tested file also had a Summary section, which the Master profile schema does not define, and it took the font name as an input. Compile with `typst compile --ignore-system-fonts --font-path <dir> --pdf-standard ua-1 resume.typ out.pdf`.

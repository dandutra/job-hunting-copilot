---
type: decision
title: Resumes follow Canadian conventions
description: A Tailored resume is one page in Word with no text below 11 pt, with a bulleted Highlights of Qualifications, plain-language bullets in action, how, result form, and an order set by the Posting's main theme.
tags: [tailoring, rendering]
sources: ["#59", "docs/research/canadian-resume-conventions.md", "docs/research/workday-ats.md"]
generated:
  by: claude-opus-5-5
  at: 2026-11-06T14:00:00-05:00
---

The first hand-tailored resume took 5 drafts. The first 3 used resume conventions the model recalled, and the user rejected them. These rules come from the two research notes, and the user confirmed them on that resume.

**One page at 11 pt or more, counted by Word.** Canadian career centres allow one or two pages, and the only tech-specific source says one. The user requires one page on every resume, with no exceptions, and no text below 11 pt (#110). Two estimates were wrong, by 7 lines and then by 2, so the page count comes from Word, which the user exports the PDF from. Overflow is never fixed with a smaller font or tighter spacing: the weakest line goes, one at a time, each cut approved by the user. Bullets go before Highlights, and the Highlights never drop below 4. Earlier resumes went to 10.5 and 9.5 pt, and one shipped at 2 pages.

**A bulleted Highlights of Qualifications, not a prose profile.** It has 4 to 6 bullets, and each one names where the skill came from. U of T, Seneca, Waterloo and York teach this format. A prose profile written as "I" sentences was rejected because it didn't read like a resume.

**Plain language for a non-technical reader.** The hiring manager may not know tool names. Plain words go in the highlights and the bullets. Tool names go in Skills and in the "how" part of a bullet, and only where the reader would know them. A proper noun the reader can't decode, such as an internal project name, is flagged before the draft is finished.

**Bullets are action, then how, then result, with no "I".** Canadian career centres teach this, and Google's XYZ formula has the same parts. No Canadian source recommends STAR for bullets, so STAR stays in interview answers.

**The Posting's main theme sets the order.** The default order is Highlights, Experience, Projects, Skills, Education. The main theme leads the highlights and the bullets within each entry. Every skill listed has at least one bullet that shows it, because Waterloo names unsupported skills as a reason resumes are passed over.

**The application form is part of the output.** Workday never fills Skills from a resume and asks for a plain-text role description for each Experience. A tailoring run also outputs the Skills list to type and a role description for each chosen Experience, both citing Facts. The description is prose about the work led by the Posting's theme, with no length target (#110). See [Workday resume parsing](../gotchas/workday-resume-parsing.md).

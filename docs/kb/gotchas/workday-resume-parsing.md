---
type: gotcha
title: Workday resume parsing
description: What Workday's "Autofill with Resume" got wrong on a real application, and how the profile and rendered resumes avoid it.
tags: [tailoring, rendering, ats]
sources: ["docs/research/workday-ats.md"]
generated:
  by: claude-opus-5-5
  at: 2026-11-06T13:30:00-05:00
---

This is the first observation from a real ATS. [Resumes render with Typst and docx](../decisions/resumes-render-with-typst-and-docx.md) notes that no ATS had tested the output before it.

- **An acronym in brackets in a program name is read as the school.** On a 2026-11-06 Workday application, an education line shaped "<Program> (<ACRONYM>), Diploma, <College>" was parsed with the acronym as the college. Keep program names free of bracketed acronyms in the Master profile, and put the school name first or on its own line when an education entry is rendered.
- **Parsing never fills Skills.** Workday's admin guide says autofill skips the Skills and Languages fields, so the candidate types them into the form. See [docs/research/workday-ats.md](../../research/workday-ats.md).
- **A word hyphenated at a line break extracts joined.** In a PDF exported from Word, a compound such as "job-search" that breaks across two lines extracts as "jobsearch". Reword the line or use a non-breaking hyphen.
- **Check every autofilled field before submitting.** Workday says parsing results "can vary based on resume format and order of words", and the research note lists what is documented and what is folklore.

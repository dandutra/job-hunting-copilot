---
type: decision
title: Resumes render with Typst and docx
description: One typed model feeds two small renderers, the Typst CLI for PDF and the docx npm package for DOCX; Chromium and LibreOffice stay out, and no real ATS has tested the output yet.
tags: [tailoring, stack]
sources: ["#14"]
generated:
  by: claude-opus-5-5
  at: 2026-11-02T16:35:00-05:00
---

A Tailored resume has to reach ATS parsers as both PDF and DOCX. One template would have been easier to keep consistent, but every way to get one has a cost we rejected. Typst has no native DOCX output, and third-party converters reportedly lose styles. LibreOffice needs a full office suite in the image: the Gotenberg image that bundles it with Chromium is 706 MB compressed. Chromium produced a PDF as clean as Typst's, but used about 570 MB per render against 19 MB for Typst, and the Droplet has 2 GiB for everything.

So `packages/resume-render` holds one typed model and two renderers: the Typst CLI, pinned at 0.15.1, and the `docx` npm package. The cost is two templates that can drift, so a contract test reads both files back against the model. Typst is also pre-1.0, so an upgrade needs review. [TypeScript stack with a Python worker](typescript-stack-with-python-worker.md) stands: the Python worker is not involved, and the API image gains at most one binary and a font.

The model is the renderer's whole input and has no Entry IDs, `sources`, `rules` or Do-not-claims, so those cannot print. Whether rendering runs in the API or next to the `/tailor` skill is open in [#15](https://github.com/dandutra/job-hunting-copilot/issues/15).

The evidence for the tool is stronger than the evidence for parsing. Both outputs gave 32 of 32 expected strings in order across 9 reader runs, but no reader was an ATS. Vendors document layout failures, not a preferred format, so the templates stay single-column with body text only. The upload rule is low confidence: PDF on Greenhouse and anywhere unlisted, DOCX on Workday and Taleo. The [smoke test](https://github.com/dandutra/job-hunting-copilot/issues/44) confirms or changes it. Findings are in [the research file](https://github.com/dandutra/job-hunting-copilot/blob/research/resume-rendering/docs/research/resume-rendering.md).

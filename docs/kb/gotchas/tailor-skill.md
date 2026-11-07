---
type: gotcha
title: The /tailor skill
description: How the /tailor skill checks the profile version, what it leaves to the API, and the summary shape it relies on.
tags: [tailoring, privacy]
sources: ["#59"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-07T12:00:00-05:00
---

`.claude/skills/tailor/` holds `SKILL.md` and `fetch-input.sh`. The script runs from the repo root and reads `COPILOT_API_URL` from `.env`, as `/tailor-review` does.

- The profile version ID is the SHA-256 of the file text, so `shasum -a 256 data/master-profile.yaml` matches it. The script exits 3 on a mismatch and deletes the fetched input, so a stale profile never reaches the writer. See [Master profile import](master-profile-import.md).
- `summary` is a list of lines, one per Highlight, named `summary[0]`, `summary[1]` and so on. Until #59 it was one line holding every Highlight, so one verdict covered all of them and the Trace check couldn't tell which Fact backed which Highlight. The API reads and approves a draft stored in the old shape by wrapping its summary in a list.
- `/tailor-review` runs as a fork from the repo root, so it reads the repo's `.env` whatever directory `/tailor` ran in. `/tailor` passes its own API base as the second argument. A test against a local API without that argument reached the live API.
- The skill's cover letter check is a reading of the Posting text, not a rule in the API.
- Rule 3 is one-way. A bullet may cite a Fact from another Entry only when that Fact's own `related` lists a Fact under the bullet's Experience or Project.
- Reject notes in the tailoring input hold line locations, not text. The skill fetches `GET /tailored-resumes/<resumeId>` to see the rejected wording. Only `/tailor-review` must stay blind to the Posting.
- The draft shape is a strict object, so it cannot carry the section order or a header that cites the research notes (lessons 1 and 4 of #59). The section order Highlights, Experience, Projects, Skills, Education belongs to the renderer (#41).

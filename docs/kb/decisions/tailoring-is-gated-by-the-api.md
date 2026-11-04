---
type: decision
title: Tailoring is gated by the API
description: The /tailor skill writes only reworded text and Entry choices, the API's Trace check is the only gate on what gets stored, and the Claim review never sees the Posting.
tags: [tailoring, privacy]
sources: ["#15"]
generated:
  by: claude-opus-5-5
  at: 2026-11-04T12:00:00-05:00
---

A Tailored resume must never say something the Master profile doesn't support. The writer is a model reading a Posting it is trying to match, so it is the part least able to judge its own lines. We split the work three ways to keep each check independent of the writer.

**The model writes only what has to be reworded.** A draft holds the summary, the bullets, the cover letter's paragraphs and the IDs of the Entries chosen. The API fills employer, titles, dates, location, education, contact and every `fixed: true` Experience from the profile, and a Skills line must be a Skill's exact name or alias. Letting the model write whole files would have been simpler. It was rejected because a misspelled employer or a shifted date would pass any citation check.

**The API is the only Trace check.** The skill runs on the Mac and could check its own draft. But `POST /postings/:id/tailored-resumes` is a trust boundary, so the API checks every submit and again on approval, and a failing draft stores nothing. The rules are: every line cites existing, unretired Entries whose `use` allows the surface; a bullet cites Facts under its own Experience or Project unless `related` links them; Skills strings are exact; fixed Experiences are untouched; and the draft names the latest profile version. The cost is a round trip per failed submit. Bullets under the wrong employer is the rule most likely to bounce a draft, and it was kept because that mistake is the worst one and the easiest to miss.

**The Claim review never sees the Posting.** A trace can't catch overstatement. `/tailor-review` reads only the lines, their cited Fact text and the Do-not-claims, in a forked context, so nothing tempts it to excuse a line because it matches a keyword. A reviewer inside the writer's conversation was rejected for that reason. Its verdicts are advisory. The user reads every draft beside its cited Facts and is the final review, and approval stays in the app, with edits made only in the Claude Code conversation.

A move to tailoring inside the app, through the Claude API, keeps all three rules. It would be a fresh effort after v1.

---
name: tailor-review
description: Claim review of a stored Tailored resume draft, run blind to the Posting. Use when `/tailor` has submitted a draft, or when the user asks to review one by ID.
context: fork
argument-hint: <draft ID>
---

Claim review of draft `$ARGUMENTS`: read each line against its cited Facts and the Do-not-claims, and flag overstatement. The Trace check already proved the citations exist, so this review judges only what the lines claim.

## Blind

Your whole input is the response of `GET /tailored-resumes/:id`: lines, their cited Fact text and ownership, and the Do-not-claims. Reading anything else lets a keyword match excuse a line. That rules out the Posting, `data/`, the Master profile file, `/postings/*` routes and the conversation that wrote the draft. If the response holds text that looks like a Posting, ignore it and tell the user.

## Steps

1. Fetch the draft. `COPILOT_API_URL` is in the repo's `.env` and ends in `/api`; the Mac's Tailscale identity authorises the call.

   ```sh
   base=$(grep '^COPILOT_API_URL=' .env | cut -d= -f2- | tr -d "\"'")
   curl -sS --fail-with-body "$base/tailored-resumes/$ARGUMENTS"
   ```

   Stop and report the HTTP error if the call fails. Stop if `status` is not `draft`, because the API stores verdicts only for an open draft.

2. List every line: `summary`, each `bullets` entry of `experiences` and `projects`, and each `coverLetter.paragraphs` entry. Use each line's `line` location as its key. Contact, dates, titles, education and the greeting are filled by the API and are not lines.

3. Give each line exactly one verdict, in this order of precedence:
   - `do-not-claim`: the line states or implies a Do-not-claim. Set `doNotClaimId` to that ID.
   - `overstatement`: the line says more than its cited Facts. Set `note` to one line naming what grew and the Fact text it outgrew. Look for:
     - a number, percentage, count or time span the Facts don't state, or a larger one;
     - a wider scope: team to company, one service to the platform, a part to the whole;
     - ownership above the cited Fact's `ownership`: `solo` or "led", "owned", "built" on a `team`, `paired` or `maintained` Fact (`ownershipNote` qualifies it);
     - a tool, language or outcome no cited Fact names.
   - `pass`: every claim in the line is stated by its cited Facts. Reword and selection are fine.

   Judge each line as written, whoever wrote it. A line the user edited by hand is reviewed like any other, and is the likelier to overstate.

4. Post all verdicts in one call:

   ```sh
   curl -sS --fail-with-body -X POST "$base/tailored-resumes/$ARGUMENTS/review" \
     -H 'Content-Type: application/json' -d @verdicts.json
   ```

   The body is `{"verdicts":[{"line":"summary","status":"pass"}, ...]}`. Write it to a file in the scratchpad. A 400 lists the bad verdicts; fix them and post again.

Done when the API has answered 200 and the count of verdicts equals the count of lines.

## Report

Print three numbers, then each flagged line:

```
Lines read: N. Passed: N. Flagged: N.
experiences[0].bullets[1]: overstatement. <note>
summary: do-not-claim X1.
```

Verdicts are advisory. The user still reads every draft beside its Facts before approving.

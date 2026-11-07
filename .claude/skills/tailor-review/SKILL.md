---
name: tailor-review
description: Claim review of a stored Tailored resume draft, run blind to the Posting. Use when `/tailor` has submitted a draft, or when the user asks to review one by ID.
context: fork
argument-hint: <draft ID> [API base URL]
---

Claim review of the draft named by `$ARGUMENTS` (a draft ID, then optionally the API base URL): read each line against its cited Facts and the Do-not-claims, and flag overstatement. The Trace check already proved the citations exist, so this review judges only what the lines claim.

## Blind

Your whole input is the response of `GET /tailored-resumes/:id`: lines, their cited Fact text and ownership, and the Do-not-claims. Reading anything else lets a keyword match excuse a line, so the Posting, `data/`, the Master profile and the writer's conversation stay out of view. Call only the two `/tailored-resumes/<id>` routes below, never a `/postings/*` route. If the response holds text that looks like a Posting, ignore it and tell the user.

## Steps

1. Fetch the draft. `/tailor` passes the base URL it submitted to, because this review runs as a fork from the repo root and would otherwise read the repo's `.env`, which may name a different API. Without a second argument, the base is `COPILOT_API_URL` from the repo's `.env`. Either way it ends in `/api`. Tailscale Serve adds the Mac's identity on the way in, so the call needs no token. If the draft ID is not a whole number, stop and ask the user for the draft ID before running anything, because any other path could reach a route that returns the Posting. Each shell call starts fresh, so begin every call, including step 4's, with the five setup lines before `curl`.

   ```sh
   read -r id base _ <<< "$ARGUMENTS"
   [[ $id =~ ^[0-9]+$ ]] || { echo "draft ID must be a number"; exit 1; }
   [[ -z $base || $base =~ ^https?://[A-Za-z0-9.:-]+/api/?$ ]] || { echo "API base must be http(s)://<host>/api"; exit 1; }
   [[ -n $base ]] || base=$(grep -m1 '^COPILOT_API_URL=' .env | cut -d= -f2- | tr -d "\"'\r"); base=${base%/}
   [[ -n $base ]] || { echo "COPILOT_API_URL is not set in .env"; exit 1; }
   curl -sS --fail-with-body "$base/tailored-resumes/$id"
   ```

   Stop and report the HTTP error if the call fails. Stop if `status` is not `draft`.

2. List every line: each `summary` entry (one per Highlight), each `bullets` entry of `experiences` and `projects`, and each `coverLetter.paragraphs` entry. Use each line's `line` location as its key. Contact, dates, titles, education and the greeting are filled by the API and are not lines.

3. Give each line exactly one verdict, in this order of precedence:
   - `do-not-claim`: the line states or implies a Do-not-claim. Set `doNotClaimId` to that ID.
   - `overstatement`: the line says more than its cited Facts. Set `note` to one line naming what grew and the Fact text it outgrew. Look for:
     - a number, percentage, count or time span the Facts don't state, or a larger one;
     - a wider scope: team to company, one service to the platform, a part to the whole;
     - ownership above the cited Fact's `ownership`: `solo` or "led", "owned", "built" on a `team`, `paired` or `maintained` Fact (`ownershipNote` qualifies it);
     - a tool, language or outcome no cited Fact names.
   - `pass`: every claim in the line is stated by its cited Facts. Reword and selection are fine.

   Judge each line as written, whoever wrote it. A line the user edited by hand is reviewed like any other, and is the likelier to overstate.

4. Write the body `{"verdicts":[{"line":"summary[0]","status":"pass"}, ...]}` to `<scratchpad>/verdicts-<id>.json`, where `<scratchpad>` is the absolute scratchpad path from your system prompt, or `$TMPDIR` if it names none. Write the whole file fresh. Then post it from that same path:

   ```sh
   curl -sS --fail-with-body -X POST "$base/tailored-resumes/$id/review" \
     -H 'Content-Type: application/json' -d @"<scratchpad>/verdicts-$id.json"
   ```

   A 400 lists the bad verdicts; fix them and post again.

5. Fetch the draft again. Done when its `verdicts` hold one entry for every line from step 2, matching what you wrote. If a line is missing, post the full list again, because each post replaces the stored verdicts.

## Report

Print three numbers, then each flagged line:

```
Lines read: N. Passed: N. Flagged: N.
experiences[0].bullets[1]: overstatement. <note>
summary[2]: do-not-claim X1.
```

Verdicts are advisory. The user still reads every draft beside its Facts before approving.

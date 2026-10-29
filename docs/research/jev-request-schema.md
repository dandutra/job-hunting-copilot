# Jev request schema

Research for ticket #2. Checked on 2026-10-29 against TypeSafe's docs and OpenAPI spec, the published `@typesafe-ai/sdk` 0.7.0 package, and the Netlify and Vercel gateway docs. No API key was used and no paid call was made. Example answer values are copied from TypeSafe's docs or marked as illustrative.

## Summary

1. Every question type goes to one endpoint, `POST https://api.typesafe.ai/v1/systemone`, with `Authorization: Bearer <key>` and a JSON body `{model, state, questions}`. `questions` maps names you choose to `{type: "noul"|"choice"|"score", instructions, criteria}`.
2. The response is `{model, answers, usage}`. `answers` is keyed by your question names. A Noul answer is `{noul}` (P(yes), 0 to 1) and a Choice answer is `{choice, confidence, probabilities}`. A Score answer is `{score, confidence, legend, probabilities}`, with `score` running from 0 to (number of levels − 1), not 0 to 1.
3. In the SDK, you call `client.systemOne({ state, questions: { x: noul(...), y: choice(...), z: score(...) } })`. The client reads `TYPESAFE_API_KEY` and `TYPESAFE_BASE_URL`, defaults to `jev-latest` (now `jev-1.14.0`), and needs Node.js 22 or newer.
4. A request may hold any number of questions. The limits are 64k tokens per request and 32k tokens for the state plus any one question (262k with a long-context header), and the body may be at most 32 MiB. Rate limits are set per organization in tokens and requests per second; TypeSafe does not publish the numbers.
5. Input costs $0.042 per million tokens and output is free. For kb-capture.sh, rename `input` to `state` and turn the `tasks` array into a `questions` object. The hook also has to send `model` and read `.answers.<name>.noul` and `.answers.<name>.choice`.

## Endpoint and auth

| Route | URL | Auth header | Model field |
|---|---|---|---|
| TypeSafe direct | `POST https://api.typesafe.ai/v1/systemone` | `Authorization: Bearer $TYPESAFE_API_KEY` | `jev-latest`, `jev-preview`, `jev-1.14.0`, `jev-1.13.0` |
| Vercel AI Gateway, TypeSafe-compatible | `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone` | `Authorization: Bearer $AI_GATEWAY_API_KEY` (or a Vercel OIDC token) | `typesafe-ai/jev` in Vercel's examples |
| Vercel AI Gateway, generic Decision API | `POST https://ai-gateway.vercel.sh/v1/evaluate` | same as above | `typesafe-ai/jev`, with question type `boolean` instead of `noul` |
| Netlify AI Gateway | Whatever Netlify injects as `TYPESAFE_BASE_URL` inside Netlify Functions and Edge Functions | Netlify injects `TYPESAFE_API_KEY` | `jev-latest`, `jev-preview`, `jev-1.14.0`, `jev-1.13.0` |

- The OpenAPI spec names `https://api.typesafe.ai` as the server and requires `model`, `state` and `questions` in the body. It declares the security scheme as HTTP bearer. ([OpenAPI](https://api.typesafe.ai/openapi.json), [API reference](https://docs.typesafe.ai/api/system-one.md))
- The SDK source builds the URL as `${baseURL}/v1/systemone` and sends `Authorization: Bearer ${apiKey}`. It also sends `User-Agent`, `X-TypeSafe-SDK`, `X-TypeSafe-Runtime` and `X-TypeSafe-Retry-Count`. When `model` is omitted, the SDK fills in its default model before it sends the request. (`dist/index.mjs` in the [0.7.0 tarball](https://registry.npmjs.org/@typesafe-ai/sdk/-/sdk-0.7.0.tgz))
- `GET /v1/models` lists the aliases the account can use. Versioned IDs work even when that list does not show them. ([Models](https://docs.typesafe.ai/models.md))
- TypeSafe's raw error body is `{"detail": ...}` for 400 and `{"detail": [{loc, msg, type}]}` for 422 ([OpenAPI](https://api.typesafe.ai/openapi.json)). Vercel's TypeSafe-compatible route documents its own errors as `{"message", "error_type"}` and passes provider errors through unchanged ([Vercel TypeSafe API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)).
- The Vercel route returns the same fields plus `provider_metadata.gateway` with cost and routing ([Vercel TypeSafe API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)). The generic Decision API renames the Noul field: a `boolean` answer is `{type: "boolean", probability}` ([Vercel Decision](https://vercel.com/docs/ai-gateway/modalities/decision)).
- Netlify's gateway only exists inside Netlify compute, and a project needs one production deploy before it turns on ([Netlify AI Gateway](https://docs.netlify.com/build/ai-gateway/overview/)). This project runs on a cloud host with Docker Compose ([App runs in the cloud](../kb/decisions/app-runs-in-the-cloud.md)), so its worker cannot use the Netlify route. The direct API and Vercel's gateway both work from any host that holds a key.

## Request and response by question type

Each question has a name, a `type`, `instructions` and `criteria`. The name is only for your code and the model never sees it, so the full question belongs in `instructions` ([Primitives](https://docs.typesafe.ai/primitives.md)). `instructions` and every criterion can be a string, a JSON object or an array ([Advanced: structure](https://docs.typesafe.ai/primitives/advanced.md)).

### Noul

Request (from the [OpenAPI examples](https://api.typesafe.ai/openapi.json)):

```json
{
  "model": "jev-latest",
  "state": "I was charged twice for my subscription this month. Please refund the extra charge.",
  "questions": {
    "billing": { "type": "noul", "instructions": "Is this message about billing?" }
  }
}
```

Response:

```json
{
  "model": "jev-latest",
  "answers": { "billing": { "type": "noul", "noul": 0.98 } },
  "usage": { "input_tokens": 120, "output_tokens": 12 }
}
```

- Noul `criteria` is optional: `{"true": "...", "false": "..."}`. Either `instructions` or at least one described outcome is required. ([OpenAPI](https://api.typesafe.ai/openapi.json), SDK `validateNoul`)
- A Noul answer has no `confidence` field. TypeSafe suggests 0.7 as a starting threshold for yes and 0.3 for no. If code wants one gate for Noul and Choice, it can use `|2p − 1|`. ([Confidence](https://docs.typesafe.ai/confidence.md), [Noul](https://docs.typesafe.ai/primitives/noul.md))

### Choice

Request:

```json
{
  "model": "jev-latest",
  "state": "I was charged twice for my subscription this month. Please refund the extra charge.",
  "questions": {
    "tone": {
      "type": "choice",
      "instructions": "What is the tone of this message?",
      "criteria": {
        "angry": "An upset or hostile message",
        "calm": "A neutral or polite message",
        "excited": "An enthusiastic or eager message"
      }
    }
  }
}
```

Response:

```json
{
  "model": "jev-latest",
  "answers": {
    "tone": {
      "type": "choice",
      "choice": "calm",
      "confidence": 0.7,
      "probabilities": { "angry": 0.15, "calm": 0.8, "excited": 0.05 }
    }
  },
  "usage": { "input_tokens": 120, "output_tokens": 12 }
}
```

- `criteria` is a map from label to description, with 1 to 255 labels. A `null` description leaves the label to speak for itself. ([OpenAPI](https://api.typesafe.ai/openapi.json), [Choice](https://docs.typesafe.ai/primitives/choice.md))
- Both the labels and the descriptions reach the model. TypeSafe advises adding an `other` option when the list might not cover every input. ([Choice](https://docs.typesafe.ai/primitives/choice.md))
- Jev 1.13 leans toward the first option in some cases. TypeSafe's advice is to reorder the options and check that the answer stays the same. ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md))

### Score

Request:

```json
{
  "model": "jev-latest",
  "state": "I was charged twice for my subscription this month. Please refund the extra charge.",
  "questions": {
    "urgency": {
      "type": "score",
      "instructions": "How urgent is this message?",
      "criteria": ["Can wait", "Needs attention this week", "Needs attention today"]
    }
  }
}
```

Response:

```json
{
  "model": "jev-latest",
  "answers": {
    "urgency": {
      "type": "score",
      "score": 1.7,
      "confidence": 0.55,
      "legend": { "0": "Can wait", "1": "Needs attention this week", "2": "Needs attention today" },
      "probabilities": { "0": 0.1, "1": 0.1, "2": 0.8 }
    }
  },
  "usage": { "input_tokens": 120, "output_tokens": 12 }
}
```

- `criteria` is an ordered array from low to high. A level's number is its index. ([Score](https://docs.typesafe.ai/primitives/score.md))
- The OpenAPI schema allows 1 to 10 levels. The Score page and the SDK both require at least two, and the SDK rejects a one-level Score before sending it. Use 2 to 10 levels. ([OpenAPI](https://api.typesafe.ai/openapi.json), [Score](https://docs.typesafe.ai/primitives/score.md), SDK `validateQuestions`)
- `score` is the probability-weighted mean of the level numbers, so it runs from 0 to `levels − 1`. To put Scores of different lengths on 0 to 1, divide by `levels − 1`. ([Score](https://docs.typesafe.ai/primitives/score.md))
- Jev never sees a level's number or its neighbours. Each level is judged on its own, so describe situations, not degrees. ([Score](https://docs.typesafe.ai/primitives/score.md))
- TypeSafe warns that Score levels are "weak in numerical calibration". A Score is fine to threshold, but it should not be used to interpolate an exact quantity. ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md))
- Jev's Score is a question type. The project's Tier is a separate thing, built from Jev answers in code.

## Several questions in one request

All questions in one request share one `state` and run in parallel. Each is evaluated independently, so one answer never becomes context for another. There is no limit on the number of questions, only the context limits below. Adding a question costs only its own tokens and barely changes the latency. ([Primitives](https://docs.typesafe.ai/primitives.md), [Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md)) TypeSafe's own benchmark sent 13 questions in one call. It found that call 12.2x cheaper and 10.0x faster than 13 separate calls, with the same answers ([Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions.md)). The Primitives page quotes an older run of 11.5x and 9.6x.

A Posting classification fits in one request. The shape below follows the API reference. The question wording and the answer values are illustrative only, not output from a real call.

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({ defaultModel: "jev-1.14.0" }); // pinned, see "Models and versions"

const { answers, usage, model } = await client.systemOne({
  state: { posting: postingText, master_profile: masterProfileSummary },
  questions: {
    fit: score("How well does `master_profile` match what `posting` requires?", [
      "Few of the required skills or experience appear in the profile",
      "Some required skills appear, with clear gaps in the core stack",
      "Most required skills appear, with minor gaps",
      "The profile covers the required skills and the level asked for",
    ]),
    role_family: choice("What kind of role is `posting` for?", {
      full_stack: "Works across front end and back end",
      back_end: "Server-side services, APIs and data",
      front_end: "Browser or mobile user interfaces",
      cloud_ops: "Infrastructure, deployment, reliability or DevOps",
      support: "Technical or application support",
      other: "None of the above",
    }),
    work_arrangement: choice("Where does `posting` say the work happens?", {
      hybrid: "Part on-site and part remote",
      remote: "Fully remote",
      on_site: "Fully on-site",
      not_stated: "The posting does not say",
    }),
    junior_eligible: noul(
      "Does `posting` accept a new graduate or junior candidate?",
      { true: "It names new grads, juniors, entry level, or 0 to 2 years", false: "It requires a senior level or more years than that" },
    ),
  },
});
// answers.fit.score is 0..3; answers.role_family.choice is one of the six labels;
// answers.junior_eligible.noul is P(yes).
```

On the wire, this request is the same `{model, state, questions}` body with four entries under `questions`. The response has four entries under `answers` with the same names.

TypeSafe's guidance bears on the calibration protocol in four places:

- A broad judgment should be split into one Score per factor and recombined with weights in code. A single "fit with the Master profile" Score may give low confidence because it measures several things at once. ([Score](https://docs.typesafe.ai/primitives/score.md), [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md))
- Arithmetic and date comparisons belong in code, which matters for years of experience and Posted at ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- Accuracy falls when the state carries detail the question does not need. Trim the Posting and the Master profile to the relevant fields. (same page)
- An alias such as `jev-latest` moves on each release, so its answers can change without any code change. Thresholds tuned on one version should run with that version's pinned ID, and every response's `model` field should be logged. ([Models](https://docs.typesafe.ai/models.md))

## Token budget and request limits

| Limit | Value | Source |
|---|---|---|
| Per-request context (state plus all questions) | 64k tokens, or 262k with `TypeSafe-Danger-Zone-Long-Context: true` | [Models](https://docs.typesafe.ai/models.md) |
| Per-question context (state plus any one question) | 32k tokens, or 262k with the same header | [Models](https://docs.typesafe.ai/models.md) |
| Number of questions | No limit beyond the two context limits | [Models](https://docs.typesafe.ai/models.md), [Primitives](https://docs.typesafe.ai/primitives.md) |
| Choice options | 1 to 255 | [OpenAPI](https://api.typesafe.ai/openapi.json) |
| Score levels | 2 to 10 (the schema says a minimum of 1, the docs and SDK say 2) | [OpenAPI](https://api.typesafe.ai/openapi.json), [Score](https://docs.typesafe.ai/primitives/score.md) |
| Body size | 32 MiB, compressed and decompressed; a larger body returns 413 | [Request rules](https://docs.typesafe.ai/api/errors.md) |
| Nesting | 64 levels in each of `state`, `instructions` and `criteria` | [Request rules](https://docs.typesafe.ai/api/errors.md) |
| Numbers | Finite only; send large identifiers as strings | [Request rules](https://docs.typesafe.ai/api/errors.md) |
| Compression | `gzip`, `x-gzip` or `zstd`, one layer only | [Request rules](https://docs.typesafe.ai/api/errors.md) |

- A request over the context length returns 400 with `max_tokens_exceeded` ([Request rules](https://docs.typesafe.ai/api/errors.md)).
- Long context costs the same per token but is slower and less accurate ([Models](https://docs.typesafe.ai/models.md)).
- Vercel lists a 32,000-token context window for `typesafe-ai/jev` ([Vercel model page](https://vercel.com/ai-gateway/models/jev)). Netlify's launch post says about 32,000 tokens, or about 150,000 characters of English ([Netlify changelog](https://www.netlify.com/changelog/typesafe-jev-ai-gateway/)). Both figures match the per-question limit. Whether Vercel allows the 64k per-request limit or the long-context header is unverified.

## Rate limits, retries and timeouts

- TypeSafe sets rate limits per organization, in tokens per second and requests per second. The values are shown only in the developer console, and higher limits come with custom and enterprise plans. Going over either limit returns 429. ([Models](https://docs.typesafe.ai/models.md))
- Retry 429 and `529 Overloaded` with exponential backoff ([Request rules](https://docs.typesafe.ai/api/errors.md)).
- The SDK retries twice by default, on 408, 429 and 500 to 599. The backoff starts at 500 ms, doubles up to 5 s, and has 25% jitter. The SDK honours `retry-after-ms` and `Retry-After` up to 60 s. The default timeout is 10 s per attempt, with no total budget. (SDK `RetryPolicy` and `TypeSafeClientConfig` in `dist/index.d.cts`)
- Netlify's gateway limits a team per minute, in credits: Free 90, Personal 450, Pro 1,800, Enterprise 9,000. One US dollar is 180 credits. ([Netlify AI Gateway](https://docs.netlify.com/build/ai-gateway/overview/))
- Vercel's gateway rate limits for Jev were not checked.

## Pricing

- Input tokens cost $0.042 per million ($42 per billion) for both `jev-1.14.0` and `jev-1.13.0`. Output tokens are free. ([Models](https://docs.typesafe.ai/models.md), [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev), `Usage` in the [OpenAPI](https://api.typesafe.ai/openapi.json))
- Vercel lists the same $0.042 per million input tokens ([Vercel model page](https://vercel.com/ai-gateway/models/jev)). Its sample response reports `"cost": "0.00001155"` for 275 input tokens, and 275 × $0.042 / 1,000,000 gives the same figure.
- Netlify converts provider cost to credits at 180 credits per dollar ([Netlify AI Gateway](https://docs.netlify.com/build/ai-gateway/overview/)). Netlify's own per-model price for Jev was not checked.
- A rough estimate, not a measurement: a 5,000-token request (Posting plus trimmed Master profile plus four questions) costs about $0.00021. At 500 Postings a day, that comes to about $0.11 a day.
- No free tier or signup credit was found in TypeSafe's docs.

## SDKs

- The JavaScript SDK is `@typesafe-ai/sdk` 0.7.0, published 2026-10-14 under the MIT licence. It requires Node.js 22 or newer and has no runtime dependencies. ([npm registry](https://registry.npmjs.org/@typesafe-ai/sdk), [changelog](https://docs.typesafe.ai/sdk/javascript/changelog.md))
- Its exports are `TypeSafeClient`, `noul(instructions, criteria?)`, `choice(instructions, criteria)`, `score(instructions, criteria[])` and `box()`. There are also error classes, one per status: `BadRequestError`, `AuthenticationError`, `RateLimitError` with `retryAfterMs`, and `InternalServerError`. (`dist/index.d.cts`)
- `systemOne()` returns an `APIPromise`. Its `.withResponse()` method also gives the `x-typesafe-request-id`. (`dist/index.d.cts`)
- The client reads `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL` (default `https://api.typesafe.ai`), `TYPESAFE_DEFAULT_MODEL` (default `jev-latest`) and `TYPESAFE_LOG_LEVEL`. It refuses to run in a browser unless `dangerouslyAllowBrowser` is set. (`dist/index.d.cts`, [README](https://www.npmjs.com/package/@typesafe-ai/sdk))
- Version 0.6.0 changed Score `criteria` from an integer-keyed map to an ordered list ([changelog](https://docs.typesafe.ai/sdk/javascript/changelog.md)).
- The SDK sends bodies of 1 KiB or more compressed with zstd on Node.js 22.15 or newer. Pass `compression: false` for a proxy that rejects compressed bodies. ([README](https://www.npmjs.com/package/@typesafe-ai/sdk))
- The Python SDK is `typesafe-sdk` 0.7.5 for Python 3.10 or newer, called with `client.system_one(state=..., questions=...)`. That fits the Python worker. ([Python SDK](https://docs.typesafe.ai/sdk/python.md), [PyPI](https://pypi.org/project/typesafe-sdk/))
- Netlify's launch post says Node.js 20 and `jev-latest` = `jev-1.13.0`. The SDK 0.7.0 release and TypeSafe's Models page supersede both.

## Models and versions

- `jev-latest` and `jev-preview` both point to `jev-1.14.0`, which was released on 2026-10-14. `jev-1.13.0` is still served. ([Models](https://docs.typesafe.ai/models.md))
- Both models read text only. Images and the `box` question are experimental and need the `TypeSafe-Danger-Zone-Images: true` header. ([Models](https://docs.typesafe.ai/models.md), [OpenAPI](https://api.typesafe.ai/openapi.json))
- English gives the best accuracy. Other languages work less well. ([Models](https://docs.typesafe.ai/models.md))
- TypeSafe does not train on customer requests. Zero data retention is offered to enterprise customers only, and the retention terms for other accounts are in the Data Processing Agreement. ([Models](https://docs.typesafe.ai/models.md), [Legal](https://docs.typesafe.ai/legal.md)) The Master profile would go to TypeSafe in every request.
- The only published failure-mode list is for Jev 1.13 ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

## What to change in kb-capture.sh

File: `agent-workflow/hooks/kb-capture.sh`, function `ask_jev` (lines 35 to 48), plus the header comment and the guard. The secret scan, the trimming, the inbox gate and the 0.7 threshold can stay. TypeSafe gives 0.7 as its own starting point for a Noul yes ([Confidence](https://docs.typesafe.ai/confidence.md)). The 4,000-character message sits well inside the 32k per-question limit.

1. Point the URL at the real endpoint. `curl "$JEV_API_URL"` should hit `https://api.typesafe.ai/v1/systemone`. Either document `JEV_API_URL` as that full URL, or rename the variables to the SDK's `TYPESAFE_BASE_URL` and `TYPESAFE_API_KEY` and append `/v1/systemone`. For Vercel, the URL is `https://ai-gateway.vercel.sh/typesafe/v1/systemone` with the AI Gateway key. Update the guard on line 8 and the comment on line 4 to match.
2. Keep `Authorization: Bearer` and `Content-Type: application/json`. Both are correct.
3. Add the required `model` field. The raw API requires it, and only the SDK fills it in. Use a pinned ID such as `jev-1.14.0` through a `JEV_MODEL` variable, so the 0.7 threshold does not drift when `jev-latest` moves. Through Vercel, the value is `typesafe-ai/jev`.
4. Rename `input` to `state`.
5. Replace the `tasks` array with a `questions` object keyed by name. Rename `kind` to `type` and `question` to `instructions`.
6. For the Choice, replace `options: $types` (an array) with `criteria`, a map of label to description. The model reads the descriptions, so build the map from the index's Types table, first column to the Meaning column. Mapping each label to `null` also works, but the model then sees only the label.
7. Read answers by name. `.results[0].score` becomes `.answers.worth_keeping.noul`, and `.results[1].choice` becomes `.answers.kb_type.choice`.
8. Make HTTP errors fail. With `curl -sS` alone, a 401, 422 or 429 body still pipes into jq, `ask_jev` exits 0, and the score falls back to `0` without a word. Add `--fail`, so the existing `|| exit 0` catches it. Add `--retry 2` as well. curl's `--retry` covers timeouts and HTTP 408, 429, 500, 502, 503 and 504 ([curl man page](https://curl.se/docs/manpage.html#--retry)), but not TypeSafe's 529.
9. Remove the "placeholders" comment on lines 35 to 37.

A replacement that has been dry-run with jq against this repo's `docs/kb/index.md`. It has not been sent to the API:

```bash
# Types with their meanings: {"decision": "A choice made against real alternatives", ...}
types=$(awk '/^## Types/{t=1; next} /^## /{t=0} t && /^\|/' "$index" |
  awk -F'|' 'NR>2 {k=$2; v=$3; gsub(/[[:space:]`]/, "", k); gsub(/^[[:space:]]+|[[:space:]]+$/, "", v); if (k != "") print k "\t" v}' |
  jq -R -s -c 'split("\n") | map(select(length > 0) | split("\t") | {key: .[0], value: .[1]}) | from_entries')
[ "$types" != "{}" ] || exit 0

ask_jev() { # text, types-json -> {"score": 0..1, "type": "<one of types>"}
  curl -sS --fail --retry 2 --max-time 30 "$JEV_API_URL" \
    -H "Authorization: Bearer $JEV_API_KEY" -H 'Content-Type: application/json' \
    -d "$(jq -n --arg text "$1" --argjson types "$2" --arg model "${JEV_MODEL:-jev-1.14.0}" '{
      model: $model,
      state: $text,
      questions: {
        worth_keeping: {type: "noul", instructions: "Does `state` contain a decision, gotcha or rule worth keeping in the project knowledge base?"},
        kb_type: {type: "choice", instructions: "Which knowledge type fits what `state` describes?", criteria: $types}
      }
    }')" | jq -c '{score: .answers.worth_keeping.noul, type: .answers.kb_type.choice}'
}
```

The types check changes from `[]` to `{}` because `types` becomes an object. Lines 50 to 53, which read `score` and `type` from `ask_jev`'s output, need no change.

## Open questions

- TypeSafe's per-organization rate limits are visible only in the console, which needs an account.
- No free tier or signup credit was found. It needs checking in the console or with TypeSafe.
- It is unknown whether Vercel's `/typesafe` route accepts TypeSafe model IDs such as `jev-1.14.0`, or only `typesafe-ai/jev`. It is also unknown which Jev version `typesafe-ai/jev` resolves to, and whether it can be pinned.
- It is unknown whether Vercel's 32,000-token window means Vercel drops TypeSafe's 64k per-request limit and the long-context header.
- Vercel's gateway rate limits and Netlify's per-model Jev price were not checked.
- The OpenAPI spec allows a one-level Score while the docs and SDK require two. Which one the server enforces is unverified.
- Retention terms for non-enterprise accounts sit in the Data Processing Agreement, which was not read. They need checking before the Master profile goes into requests.
- No real response was observed. All answer values above come from TypeSafe's examples or are illustrative.

## Sources

- TypeSafe docs index: https://docs.typesafe.ai/llms.txt
- TypeSafe OpenAPI spec: https://api.typesafe.ai/openapi.json
- System One API reference: https://docs.typesafe.ai/api/system-one.md
- Request rules and errors: https://docs.typesafe.ai/api/errors.md
- Models, pricing, context and rate limits: https://docs.typesafe.ai/models.md
- Primitives (Questions): https://docs.typesafe.ai/primitives.md
- Noul: https://docs.typesafe.ai/primitives/noul.md
- Choice: https://docs.typesafe.ai/primitives/choice.md
- Score: https://docs.typesafe.ai/primitives/score.md
- Advanced: structure: https://docs.typesafe.ai/primitives/advanced.md
- Confidence: https://docs.typesafe.ai/confidence.md
- Speculative fan-out: https://docs.typesafe.ai/patterns/fan-out.md
- Composite scoring: https://docs.typesafe.ai/patterns/composite-scoring.md
- Parallel questions cookbook: https://docs.typesafe.ai/cookbooks/parallel_questions.md
- Jev 1.13 jaggedness: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
- Quick start: https://docs.typesafe.ai/introduction/quickstart.md
- Legal: https://docs.typesafe.ai/legal.md
- JavaScript SDK changelog: https://docs.typesafe.ai/sdk/javascript/changelog.md
- Python SDK: https://docs.typesafe.ai/sdk/python.md
- TypeSafe launch post (2026-09-15): https://typesafe.ai/blog/introducing-system-one-models-and-jev
- npm registry metadata: https://registry.npmjs.org/@typesafe-ai/sdk
- SDK 0.7.0 tarball (README, `dist/index.d.cts`, `dist/index.mjs`): https://registry.npmjs.org/@typesafe-ai/sdk/-/sdk-0.7.0.tgz
- npm package page: https://www.npmjs.com/package/@typesafe-ai/sdk
- PyPI typesafe-sdk: https://pypi.org/project/typesafe-sdk/
- Vercel, TypeSafe API with AI Gateway: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
- Vercel, Decision API: https://vercel.com/docs/ai-gateway/modalities/decision
- Vercel, Jev model page: https://vercel.com/ai-gateway/models/jev
- Vercel changelog (2026-09-21): https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-http-api-for-jev
- Netlify AI Gateway overview: https://docs.netlify.com/build/ai-gateway/overview/
- Netlify changelog, Jev launch: https://www.netlify.com/changelog/typesafe-jev-ai-gateway/
- Netlify changelog, Jev 1.14.0: https://www.netlify.com/changelog/typesafe-jev-1-14-0-ai-gateway/
- curl man page, `--retry`: https://curl.se/docs/manpage.html#--retry

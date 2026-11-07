---
type: gotcha
title: Master profile import
description: How PUT /master-profile and pnpm profile:import decide what to store, and what they leave unchecked.
tags: [tailoring, privacy, api]
sources: ["#27"]
generated:
  by: claude-opus-5-5
  at: 2026-11-07T10:30:00-05:00
---

`pnpm profile:import` sends `data/master-profile.yaml` to `PUT /master-profile` at `COPILOT_API_URL` (a tailnet address, set in `.env`). The Mac's Tailscale identity authorises it, so there is no token. The API validates the body itself with `validateProfile`; the CLI does not.

- The body is JSON, `{ "yaml": "<file text>" }`. The version ID is the SHA-256 of that exact string, so a trailing newline or a re-saved file makes a new version. The default Express limit of 100 KB applies; the real file is about 38 KB.
- The API rejects a file with 0 Entries (a Do-not-claim counts as an Entry). The ticket only asked this of the CLI, but an empty version would become the latest one.
- "Known ID" means an ID in the latest stored version. Every accepted version contains the one before it, so the latest holds all IDs ever accepted.
- "Latest" is the newest `created_at`. Sending an older file again stores nothing and does not make it the latest. That file would be rejected anyway, because it lacks the newer IDs.
- If the latest stored version stops validating after a schema change, every import answers 500 and logs the version's first 12 hash characters. Migrate or repair that row by hand, because versions are never updated.
- A 400 body lists every error with its Entry ID. Messages can quote the file's text (`got "..."`), so they go to the caller and never to the log. Logs hold the 12-character hash prefix only.
- `added` and `retired` compare against the latest version before the import. For a file already stored, both are 0 and `created` is false.
- "Immutable" is a convention in the code, with no database trigger. Nothing calls update or delete on `master_profile_version` except the test reset.

---
okf_version: "0.2"
---

# Job hunting copilot knowledge base

An OKF v0.2 bundle. Links are relative so they resolve the same on GitHub and in Obsidian (open `docs/kb/` as a vault with "Use markdown links" on).

Glossary: [glossary.md](glossary.md)

## Types

| Type | Meaning | When to use |
|---|---|---|
| glossary | The project's vocabulary | The one glossary file |
| decision | A choice made against real alternatives | Hard to reverse, surprising, a real trade-off |
| gotcha | Behaviour that bites if you don't know it | A bug or near-miss someone would repeat |
| job-source | One place Postings come from | Its access method, date semantics, rate limits and ToS risk; `resource` holds the endpoint |
| runbook | Steps to operate something | The ingest process, re-auth, recovery |

## Decisions

- [KB follows the OKF spec](decisions/kb-follows-okf-spec.md): this bundle follows OKF v0.2, not agent-workflow's KB-FORMAT.md, where the two differ.
- [Scraped boards are a job source](decisions/scraped-boards-are-a-job-source.md): JobSpy covers LinkedIn and Indeed, with the ToS risk accepted, next to ATS boards, alert emails and Adzuna.
- [Form filling adopts Simplify](decisions/form-filling-adopts-simplify.md): no autofill of our own; the app hands over files, form answers come from `/tailor` sessions, Simplify fills the form.
- [TypeScript stack with a Python worker](decisions/typescript-stack-with-python-worker.md): React, NestJS and Postgres, plus a Python worker for JobSpy.
- [Ingestion lives in NestJS](decisions/ingestion-lives-in-nestjs.md): one NestJS module polls every Job source through adapters and matches Sightings; Python only runs JobSpy behind `POST /scrape`.
- [Merges need certain evidence](decisions/merges-need-certain-evidence.md): two Sightings merge automatically only on an exact key or near-identical text; anything weaker stays apart as a Lookalike, and every automatic merge is logged; exact-key merges arrive reviewed, the rest wait for review.
- [Prisma over TypeORM](decisions/prisma-over-typeorm.md): Prisma for schema, client and migrations, chosen for readability over closeness to Spring Data JPA.
- [App runs in the cloud](decisions/app-runs-in-the-cloud.md): the API, its ingest process, the JobSpy service, the UI and Postgres deploy with Docker Compose to a DigitalOcean Droplet.
- [The app has no public address](decisions/app-has-no-public-address.md): the Mac reaches the app over Tailscale, the Droplet accepts no inbound traffic, and the API rejects any request without the user's Tailscale identity.
- [Personal data stays out of git](decisions/personal-data-stays-out-of-git.md): the repo is public, so profile, resumes, emails and labels live in the database and a gitignored `data/`.
- [Master profile is a versioned YAML file](decisions/master-profile-is-a-versioned-yaml-file.md): one gitignored YAML file in our own schema with permanent Entry IDs; Postgres stores an immutable version of each import.
- [Tiers are calibrated on blind Labels](decisions/tiers-are-calibrated-on-blind-labels.md): only Labels from the Label queue, with the Tier hidden and Postings picked across every Tier, count toward tuning and the pass marks.
- [Resumes render with Typst and docx](decisions/resumes-render-with-typst-and-docx.md): one typed model feeds the Typst CLI for PDF and the `docx` package for DOCX, with no Chromium or LibreOffice; no real ATS has tested the output yet.
- [Tailoring is gated by the API](decisions/tailoring-is-gated-by-the-api.md): the `/tailor` skill writes only reworded text and Entry choices, the API's Trace check gates every stored draft, and the Claim review never sees the Posting; a draft the user edits, even in a rendered file, is a new draft that is checked again.
- [Resumes follow Canadian conventions](decisions/resumes-follow-canadian-conventions.md): one rendered page, a bulleted Highlights of Qualifications, plain-language bullets in action, how, result form, an order set by the Posting's main theme, and the Workday form outputs.
- [Only boards close a Posting](decisions/only-boards-close-a-posting.md): a Posting is Closed only on a Watched company board's evidence; any other Posting goes Stale after 30 days with no report and no board listing it, and both leave the feed without touching an Application.
- [Postings stay inside the Search area](decisions/postings-stay-inside-the-search-area.md): every adapter drops rows outside Toronto, the GTA and remote-Canada before matching, so out-of-area jobs are never stored and a job that moves out of the area closes.

## Gotchas

- [Toolchain version pins](gotchas/toolchain-version-pins.md): NestJS 11, TypeScript 6, Prisma 7.10.1, Node 22 and no Corepack, each for a named reason; `prisma generate` is a manual step after install.
- [Company names and Watched boards](gotchas/company-names-and-watched-boards.md): "Canada" is stripped from every name, so aliases carry the long forms; only five ATSes count as pollable.
- [Exact-key matching rules](gotchas/exact-key-matching.md): the board veto, the Workday suffix strip, the 30-day window without a unique key, and field precedence.
- [Production Compose stack](gotchas/production-compose-stack.md): `prisma` is a runtime dependency, `migrate` never restarts, `ingest` is healthy by file, CI checks images for `data/` and `.env`, and on the Droplet every command needs `--env-file .env` and values are single-quoted.
- [JobSpy scrape service](gotchas/jobspy-scrape-service.md): `errors` is keyed by board, LinkedIn descriptions stay off, proxies come only from `JOBSPY_PROXIES`, and the fixtures are trimmed research samples.
- [Master profile schema package](gotchas/master-profile-schema-package.md): validation runs in two passes, `fitSummary` drops more than the ticket lists, `traceCheck` reports a bad draft shape as a failure and lets bullets cite only Facts, and the package builds to CommonJS `dist/` for the API, so a fresh clone must build it first.
- [Master profile import](gotchas/master-profile-import.md): the JSON body is hashed as sent, an empty file and a vanished ID are rejected, "latest" is the newest `created_at`, and errors reach the caller but not the log.
- [API contract pipeline](gotchas/api-contract-pipeline.md): `pnpm generate` rewrites both specs and the generated types, `pnpm check` fails on drift, and the spec script needs ts-node, not tsx.
- [Ingest scheduler](gotchas/ingest-scheduler.md): the lock needs its own connection and an error listener, the drain runs in `onModuleDestroy`, `minIntervalMs` paces each adapter from `last_attempt_at`, a 404 board alerts once a day, a window advances only after a poll with no blocked or fault error, `/scrape` has no paging, and only a complete board listing closes a Sighting, after a 24-hour grace and never from an empty listing.
- [Tailnet identity guard](gotchas/tailnet-identity-guard.md): the global guard 401s without the user's `Tailscale-User-Login`, 403s a state-changing request whose `Origin` host differs from `Host`, exempts only `@Public()` routes, and depends on nginx forwarding both headers.
- [Tailoring API](gotchas/tailoring-api.md): rule 6 runs on submit and approve against the latest profile version, a submit supersedes only open drafts, verdicts and reject lines name lines by location, `postingText` is stored but never returned, the GET carries the Do-not-claims and Fact ownership for `/tailor-review`, and a review post replaces all verdicts and accepts a partial list.
- [Workday resume parsing](gotchas/workday-resume-parsing.md): Workday read the "(CPP)" in a program name as the college, never fills Skills from a resume, hyphenated line breaks extract joined, and every autofilled field needs a manual check.

## Runbooks

- [Provision the server](runbooks/provision.md): build, check, rebuild and recover the Droplet, firewall, Tailscale policy and backups bucket with Terraform from the Mac.
- [Deploy, roll back and rotate secrets](runbooks/deploy.md): how a push to `main` reaches the Droplet, the rollback run, the migration rule, the one-time GitHub and Tailscale settings, and secret rotation.

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
- [Company names and Watched boards](gotchas/company-names-and-watched-boards.md): "Canada" is stripped from every name, so aliases carry the long forms; only five ATSes count as pollable; some CSV slugs arrive percent-encoded.
- [Exact-key matching rules](gotchas/exact-key-matching.md): the board veto, the Workday suffix strip, the 30-day window without a unique key, and field precedence.
- [Text merges and Lookalikes](gotchas/text-matching.md): the 0.9 merge bar, the untuned 0.5 veto, which descriptions count as evidence, how titles and metros normalize, the ATS tie rule, and what waits for the split and Application tickets.
- [Production Compose stack](gotchas/production-compose-stack.md): `prisma` is a runtime dependency, `migrate` never restarts, `ingest` is healthy by file, CI checks images for `data/` and `.env`, and on the Droplet every command needs `--env-file .env` and values are single-quoted.
- [JobSpy scrape service](gotchas/jobspy-scrape-service.md): `errors` is keyed by board, LinkedIn descriptions stay off, proxies come only from `JOBSPY_PROXIES`, and the fixtures are trimmed research samples.
- [Master profile schema package](gotchas/master-profile-schema-package.md): validation runs in two passes, `fitSummary` drops more than the ticket lists, `traceCheck` reports a bad draft shape as a failure and lets bullets cite only Facts, and the package builds to CommonJS `dist/` for the API, so a fresh clone must build it first.
- [Master profile import](gotchas/master-profile-import.md): the JSON body is hashed as sent, an empty file and a vanished ID are rejected, "latest" is the newest `created_at`, and errors reach the caller but not the log.
- [API contract pipeline](gotchas/api-contract-pipeline.md): `pnpm generate` rewrites both specs and the generated types, `pnpm check` fails on drift, and the spec script needs ts-node, not tsx.
- [Ingest scheduler](gotchas/ingest-scheduler.md): the lock needs its own connection and an error listener, the drain runs in `onModuleDestroy`, `minIntervalMs` paces each adapter from `last_attempt_at`, a 404 board alerts once a day, a window advances only after a poll with no blocked or fault error, `/scrape` has no paging, and only a complete board listing closes a Sighting, after a 24-hour grace and never from an empty listing.
- [Tailnet identity guard](gotchas/tailnet-identity-guard.md): the global guard 401s without the user's `Tailscale-User-Login`, 403s a state-changing request whose `Origin` host differs from `Host`, exempts only `@Public()` routes, and depends on nginx forwarding both headers.
- [Tailoring API](gotchas/tailoring-api.md): rule 6 runs on submit and approve against the latest profile version, a submit supersedes only open drafts, verdicts and reject lines name lines by location, `postingText` is stored but never returned, the GET carries the Do-not-claims and Fact ownership for `/tailor-review`, and a review post replaces all verdicts and accepts a partial list.
- [Workday resume parsing](gotchas/workday-resume-parsing.md): Workday read the "(CPP)" in a program name as the college, never fills Skills from a resume, hyphenated line breaks extract joined, and every autofilled field needs a manual check.
- [The /tailor skill](gotchas/tailor-skill.md): `fetch-input.sh` stops on a profile hash mismatch with exit 3, `summary` is one line per Highlight, and `/tailor` passes its API base to the forked review.
- [Backups](gotchas/backups.md): `backup.sh` signs uploads itself and needs the payload hash, the test server skips signature checks, the pre-deploy dump keys off the `copilot_pgdata` volume, and the drill counts only listed tables.
- [Jev judgement of a Posting](gotchas/jev-judgement.md): the runner reads the tables after each poll, judges what has no judgement or moved to a full description or an older profile, stores raw answers with the returned model, retries only 429 and 529, and logs no profile content.
- [Tier scoring and recompute](gotchas/tier-scoring.md): the total, caps that hold a Posting at C, the config order check and SHA-256 version, no row for an unjudged Posting, and `tier:recompute` with `--seed-thresholds`.
- [Web app shell and Tier colors](gotchas/web-shell.md): `App` takes its router from `main.tsx`, deep links rely on the nginx fallback, Tier colors are tokens plus `TierBadge`, the badge names its Tier through visually hidden text, and tests need an explicit `cleanup`.
- [Feed and Posting detail](gotchas/feed-and-posting-detail.md): the feed leaves out untiered Postings, "Why" is computed from the config as it is now, the API image carries `config/`, a Feed correction toggle-off only clears the mark in the browser, and screens take their client from `useApi()`.
- [Merge review API](gotchas/merge-review-api.md): a split or a dismissal records a "not the same" pair between Postings that absorbs carry forward, only text merges wait for review, a Lookalike merge across two Companies joins them into one, and a split Posting starts with no judgement.
- [Label queue and Feed correction API](gotchas/label-queue-api.md): phase dates sit in code, `label_draw` keeps the Posting on screen, a batch is 10 slot-filling Labels, a test-phase `cant_tell` does not fill its slot, undo works only in the open batch, and the third C-to-A correction alerts once per 7 days.
- [Label queue screen](gotchas/label-queue-screen.md): the progress count is browser-side and resets on reload, the done screen counts the session's Labels, a failed `next` is an error and never "Batch done", keys read the card from refs, and nothing Tier-derived renders.

## Job sources

- [Greenhouse board API](job-sources/greenhouse.md): `boards-api.greenhouse.io`, escaped HTML descriptions, `first_published`, no documented rate limit.
- [Lever postings API](job-sources/lever.md): `api.lever.co`, `createdAt` in epoch ms, the description spread over three fields, EU boards not reached.
- [Ashby job board API](job-sources/ashby.md): `api.ashbyhq.com`, `publishedAt` resets on republish, `workplaceType` over `isRemote`, `isListed` rows skipped.
- [Workday career-site API](job-sources/workday.md): a POST list that pages at 20 and wraps past the total, a detail call for dates, a 3-hour rate, the 2000 cap, and the RBC robots.txt risk.

## Runbooks

- [Provision the server](runbooks/provision.md): build, check, rebuild and recover the Droplet, firewall, Tailscale policy and backups bucket with Terraform from the Mac.
- [Deploy, roll back and rotate secrets](runbooks/deploy.md): how a push to `main` reaches the Droplet, the rollback run, the migration rule, the one-time GitHub and Tailscale settings, and secret rotation.
- [Seed the production database](runbooks/seed-production.md): no deploy runs the seed, so it runs from the Mac through an SSH tunnel, after the seed names are checked against the Companies JobSpy already made.
- [Back up, run the restore drill and restore](runbooks/restore.md): nightly and pre-deploy encrypted dumps, the drill on the Mac, and a full restore onto a new Droplet.

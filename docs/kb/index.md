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
- [Form filling adopts Simplify](decisions/form-filling-adopts-simplify.md): no autofill of our own; the app hands over files and answers, Simplify fills the form.
- [TypeScript stack with a Python worker](decisions/typescript-stack-with-python-worker.md): React, NestJS and Postgres, plus a Python worker for JobSpy.
- [Ingestion lives in NestJS](decisions/ingestion-lives-in-nestjs.md): one NestJS module polls every Job source through adapters and matches Sightings; Python only runs JobSpy behind `POST /scrape`.
- [Merges need certain evidence](decisions/merges-need-certain-evidence.md): two Sightings merge automatically only on an exact key or near-identical text; anything weaker stays apart as a Lookalike, and every automatic merge is logged for review.
- [Prisma over TypeORM](decisions/prisma-over-typeorm.md): Prisma for schema, client and migrations, chosen for readability over closeness to Spring Data JPA.
- [App runs in the cloud](decisions/app-runs-in-the-cloud.md): the API, its ingest process, the JobSpy service, the UI and Postgres deploy with Docker Compose to a DigitalOcean Droplet.
- [The app has no public address](decisions/app-has-no-public-address.md): the Mac reaches the app over Tailscale, the Droplet accepts no inbound traffic, and the API rejects any request without the user's Tailscale identity.
- [Personal data stays out of git](decisions/personal-data-stays-out-of-git.md): the repo is public, so profile, resumes, emails and labels live in the database and a gitignored `data/`.
- [Master profile is a versioned YAML file](decisions/master-profile-is-a-versioned-yaml-file.md): one gitignored YAML file in our own schema with permanent Entry IDs; Postgres stores an immutable version of each import.
- [Tiers are calibrated on blind Labels](decisions/tiers-are-calibrated-on-blind-labels.md): only Labels from the Label queue, with the Tier hidden and Postings picked across every Tier, count toward tuning and the pass marks.
- [Resumes render with Typst and docx](decisions/resumes-render-with-typst-and-docx.md): one typed model feeds the Typst CLI for PDF and the `docx` package for DOCX, with no Chromium or LibreOffice; no real ATS has tested the output yet.

## Gotchas

- [Toolchain version pins](gotchas/toolchain-version-pins.md): NestJS 11, TypeScript 6, Prisma 7.10.1, Node 22 and no Corepack, each for a named reason; `prisma generate` is a manual step after install.
- [Company names and Watched boards](gotchas/company-names-and-watched-boards.md): "Canada" is stripped from every name, so aliases carry the long forms; only five ATSes count as pollable.
- [Exact-key matching rules](gotchas/exact-key-matching.md): the board veto, the Workday suffix strip, the 30-day window without a unique key, and field precedence.
- [Production Compose stack](gotchas/production-compose-stack.md): `prisma` is a runtime dependency, `migrate` never restarts, `ingest` is healthy by file and kept alive by a placeholder timer, and CI checks images for `data/` and `.env`.

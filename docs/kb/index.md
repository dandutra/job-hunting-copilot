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
| runbook | Steps to operate something | The scheduled worker, re-auth, recovery |

## Decisions

- [KB follows the OKF spec](decisions/kb-follows-okf-spec.md): this bundle follows OKF v0.2, not agent-workflow's KB-FORMAT.md, where the two differ.
- [Scraped boards are a job source](decisions/scraped-boards-are-a-job-source.md): JobSpy covers LinkedIn and Indeed, with the ToS risk accepted, next to ATS boards, alert emails and Adzuna.
- [Form filling adopts Simplify](decisions/form-filling-adopts-simplify.md): no autofill of our own; the app hands over files and answers, Simplify fills the form.
- [TypeScript stack with a Python worker](decisions/typescript-stack-with-python-worker.md): React, NestJS and Postgres, plus a Python worker for JobSpy.
- [App runs in the cloud](decisions/app-runs-in-the-cloud.md): worker, API, UI and Postgres deploy with Docker Compose, the UI behind single-user auth.
- [Personal data stays out of git](decisions/personal-data-stays-out-of-git.md): the repo is public, so profile, resumes, emails and labels live in the database and a gitignored `data/`.

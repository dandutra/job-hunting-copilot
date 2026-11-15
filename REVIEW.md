# REVIEW.md

How to review a pull request in this repo, for a person or an agent. [CLAUDE.md](CLAUDE.md) holds the build rules.

An agent's approval never counts as a person's. The agent posts findings, and the owner decides.

## Risk tiers

`/review` runs `tier.sh`, which reads the globs below. A critical path forces tier 3, and a diff made only of low paths is tier 0. The tier table is in the `review` skill. `*` spans directories.

```review-tiers
critical:
  - apps/api/src/auth/*
  - apps/web/nginx.conf
  - apps/api/prisma/*
  - apps/api/src/matching/*
  - apps/api/src/ingestion/ingest-scheduler.ts
  - apps/api/src/tailoring/*
  - packages/master-profile/src/trace-check.ts
  - deploy/*
  - infra/*
  - .github/workflows/deploy.yml
low:
  - apps/web/src/*.css
```

The critical list covers the tailnet guard and the nginx config that forwards its headers, the Prisma schema and migrations, matching and merges (a merge deletes the absorbed Posting), the scheduler that closes Sightings, the Trace check and the tailoring gate, backups and deploy (`deploy/`), infra, and the deploy workflow. On a critical path the owner reads every line. Name each changed critical file in the summary.

## What failure looks like here

Each of these has cost real debugging time. Follow the link for the detail, and cite it rather than a copy.

- **A missing env var.** A new name reaches the code and `.env.example` but not `deploy/compose.prod.yaml` or the Deploy step of `deploy.yml`, so production starts without it (#35, #37, #38). `pnpm check` compares the names; read a new name's every place against [CLAUDE.md](CLAUDE.md) and the secrets list in [Deploy, roll back and rotate secrets](docs/kb/runbooks/deploy.md).
- **A fake drifting from the live API.** An adapter passes against its recorded `fixtures.json` and fails on the real board, as Workday did in #73 and hotfix #93 ([Workday career-site API](docs/kb/job-sources/workday.md), [JobSpy scrape service](docs/kb/gotchas/jobspy-scrape-service.md)). A changed adapter needs a live check in the PR's Verification section.
- **A bulk-edit corruption.** A sed or script edit across many files broke code or skipped files (#26, #37, #63, #72). Look for hunks the PR description doesn't explain, and for a renamed symbol still present in a file the diff left out.
- **A fix that brings in a new bug.** The last fix on #57 and #73 was never reviewed, and #73's open finding reached production. Review a fix commit as hard as the first draft, and check that its test fails without it (#24, #57, #58, #71).
- **A missed authorization check.** A handler serves or changes a resource without the [tailnet identity guard](docs/kb/gotchas/tailnet-identity-guard.md), or a new route is marked `@Public()`.
- **Untested behaviour.** A behaviour change with no test, or a test that would pass without the change.

## Skip

- Whatever CI already checks: build, typecheck, lint, format, tests passing.
- `pnpm-lock.yaml`, the generated `openapi.json` and `schema.d.ts` files, images and fonts.
- Style preferences the surrounding code doesn't share.
- Running tests or `pnpm check`: the test database is shared with the build.

## Findings

- Tag each finding **Important**, **Nit** or **Pre-existing**. Important means it breaks behaviour, data, security or a rule above. Pre-existing means the diff didn't cause it.
- Cite `file:line` for each finding, and quote the line or name the gotcha that backs it.
- Post at most 5 Nits. Drop the weakest beyond that.
- Start the summary with the count, for example "2 Important, 1 Nit, 0 Pre-existing", then the tier.

A review is done when every changed file has been read and every finding has a `file:line`.

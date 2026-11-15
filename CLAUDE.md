# Job hunting copilot

A single-user job-search app: it polls Job sources into Postings, tiers them, and gates Tailored resumes. The repo is public, and personal data never enters git.

## Before changing code

- Read `docs/kb/index.md` before changing code, and follow its links for the area you touch.
- Read `docs/agents/issue-tracker.md` whenever you write, read or build a ticket.
- Read `REVIEW.md` before reviewing a diff.

## Checking

- `pnpm check` is the full gate: the root script tests, the generated-file drift check, every workspace's lint, format, typecheck and tests one workspace at a time, then JobSpy's ruff and pytest. It needs Postgres from `docker compose up -d` and a running Docker daemon for the backup round-trip test.
- The API tests share one database, `<DATABASE_URL db>_test`, and wipe its tables. Run one API test process at a time, and one full `pnpm check` at a time. A reviewer reads the diff and never runs tests or `pnpm check`.
- While working, run one file: `pnpm --dir apps/api exec jest <path>`, `pnpm --dir apps/web exec vitest run <path>`, `pnpm --dir packages/master-profile exec vitest run <path>`, or `uv run pytest <path>` in `apps/jobspy`.

## Deploying

- A push to `main` deploys through `.github/workflows/deploy.yml` to one DigitalOcean Droplet over Tailscale, except a push that changes only `docs/`. The workflow sends `deploy/` there, and `deploy/deploy.sh` runs the stack from `~/copilot`.
- The app has no public address. Reach it on the tailnet only, `tailscale ssh deploy@copilot` for a shell. Rollback, secrets, seeding and restore are in `docs/kb/runbooks/`.

## A new env var

A name must reach every place that uses it: `.env.example` always; root `compose.yaml` when a local container reads it; `deploy/compose.prod.yaml` when a production container reads it; the Deploy step of `deploy.yml` (its `env:` and its `printf` list) plus the `production` environment in GitHub, for any production value; `ci.yml` when the tests need it. `scripts/check-env.mjs`, part of `pnpm check`, fails on a name missing along that path except `ci.yml`. A name read only on the Mac or by `pnpm dev` goes on its `HOST_ONLY` list.

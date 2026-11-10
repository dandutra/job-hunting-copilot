---
type: runbook
title: Deploy, roll back and rotate secrets
description: How a push to main reaches the Droplet, how to deploy an earlier commit, the one-time GitHub and Tailscale setup, and how to rotate a secret.
tags: [deploy, ops, ci]
sources: ["#36", "#39"]
generated:
  by: claude-opus-5-5
  at: 2026-11-06T15:00:00-05:00
---

Nothing here is manual on a normal day. A push to `main` that touches anything outside `docs/**` runs `.github/workflows/deploy.yml`. Decision: [The app has no public address](../decisions/app-has-no-public-address.md). Server setup: [Provision the server](provision.md).

## What a push does

1. `check` runs `pnpm check` against a throwaway Postgres.
2. `build` builds the three images once with `docker compose build`, runs `deploy/check-images-clean.sh`, and pushes them to `ghcr.io/dandutra/copilot-*` tagged by the commit SHA. Only this job has `packages: write`.
3. `deploy` runs in the `production` environment. It joins the tailnet as an ephemeral `tag:ci` node, sends `deploy/compose.prod.yaml`, `deploy/deploy.sh` and `deploy/backup.sh` over Tailscale SSH, and runs the script as `deploy`.
4. `deploy.sh` reads the `.env` lines from stdin and writes each value single-quoted, because Compose reads a quoted value literally and an unquoted one expands `$`. A value can't hold a `'` or a `\`. It pulls, moves the file into `~/copilot/.env` with mode 600, starts Postgres and runs `deploy/backup.sh pre-deploy` when a volume exists (a failed dump stops the deploy), runs `docker compose up -d --wait`, restarts `web`, then keeps the deployed SHA and the two newest other SHAs of each image.

Pull requests run the `check`, `smoke` and `shellcheck` jobs in `ci.yml` and never push or deploy. `pull_request_target` is never used. A docs-only push deploys nothing, and a push with both docs and code deploys.

The deploy job times out at 15 minutes because recreating `ingest` can wait 6 minutes for a poll to drain. A failed health check makes `up --wait` fail, so the workflow fails and the old containers that did not change keep running. The logs stay on the Droplet. Every Compose command there needs `--env-file .env`, because with `-f deploy/...` Compose looks for `.env` in `deploy/` and fails on the missing `IMAGE_TAG`:

```sh
tailscale ssh deploy@copilot
cd ~/copilot
docker compose -f deploy/compose.prod.yaml --env-file .env logs --tail=100
```

If a pull fails, the old `.env` stays in place, so these commands keep working against the running stack.

## Roll back

Actions, then Deploy, then "Run workflow" on `main`, with the full 40-character SHA of the earlier commit. The run skips `check` and `build`, pulls that SHA's images from the registry, and uses that commit's Compose file and `deploy.sh`. It goes through the same path and the same environment. The run first checks that the SHA is on `main`, so a fork's commit can't run its own `deploy.sh` on the Droplet. Nothing rolls back by itself, because an old image running on a newer schema must be someone's decision.

**The migration rule.** A migration must keep the previous image working. Removing or renaming a column takes two deploys: first stop the code from using it, then drop it. A rollback only works while this holds, because `prisma migrate deploy` never undoes a migration.

A rollback needs the image in the registry. GHCR keeps every pushed tag, but a version you deleted by hand is gone.

## One-time setup

These are settings on GitHub and Tailscale, so no file in the repo can enforce them. Check them after any change to the repo's owner or visibility.

1. **Packages.** `copilot-api`, `copilot-web` and `copilot-jobspy` must be public, because the Droplet pulls with no login. On the first deploy on 2026-11-06 they were already public after the first push. If one is private, the deploy fails at `pull`. Change it under the package's settings, then re-run the failed job. The images hold no personal data (`check-images-clean.sh` proves it on every build).
2. **Environment.** Create `production` under Settings, then Environments. Under "Deployment branches and tags" choose "Selected branches and tags" and add only `main`. A manual run from any other branch is then refused.
3. **Secrets in `production`:** `POSTGRES_PASSWORD` (no `@ : / ? #`, no `'` and no `\`, see the [Compose gotcha](../gotchas/production-compose-stack.md)), `ALLOWED_TAILSCALE_LOGIN` (your login exactly as the Tailscale admin console shows it, kept a secret so the email stays out of the logs), `JOBSPY_PROXIES` (may be empty), `HEARTBEAT_URL` (the ping URL of the polls check, below; may be empty), `TYPESAFE_API_KEY` (Jev's key; may be empty, and then no Posting is judged), `TS_OAUTH_CLIENT_ID` and `TS_AUDIENCE`. **Variables:** `JOBSPY_SEARCH_TERM`, `JOBSPY_LOCATION` and `JOBSPY_RESULTS_WANTED`, all optional. The backup settings (four variables, three secrets) are listed in [Back up, run the restore drill and restore](restore.md), and `deploy.sh` stops without them.
4. **Tailscale federated identity.** In the admin console, under Settings, Trust credentials, choose "+ Credential" and the type that asks for an issuer and a subject. The OAuth type makes a client secret and never asks for either. Set the issuer to `https://token.actions.githubusercontent.com`. Set the scope to Keys, then Auth Keys, with write access and tag `tag:ci`. Copy its client ID and audience into the two secrets above.

   The subject must be the exact string GitHub sends, which carries the numeric owner and repo IDs: `repo:dandutra@125486331/job-hunting-copilot@1438922250:environment:production`. The plain `repo:dandutra/job-hunting-copilot:...` form fails the deploy's Tailscale step with `token exchange failed with status 403`. After a failed run, the credential's edit page shows the subject it received from the issuer, and that is the value to paste. The workflow's node is ephemeral and disappears after the run. `infra/tailscale.tf` already lets `tag:ci` reach `tag:server` and log in as `deploy`.
5. **Push protection.** Settings, then Code security, then turn on "Push protection" for secret scanning.
6. **Workflow permissions.** Settings, Actions, General: set the default token to read-only. Each job also states its own `permissions`.

## Rotate a secret

GitHub cannot show a secret again after you save it, so the password manager holds a copy of every one. Change both together.

- **A GitHub secret or variable** (`JOBSPY_PROXIES`, the search settings): update it in the `production` environment and in the password manager, then re-run the latest Deploy run, or push a code change. `deploy.sh` rewrites `.env` on every run, and Compose recreates each service whose environment changed.
- **`POSTGRES_PASSWORD`:** the value in `.env` does not change the password inside an existing Postgres volume. First run `ALTER USER copilot PASSWORD '<new>'` through `docker compose -f deploy/compose.prod.yaml --env-file .env exec postgres psql -U copilot`, then update the GitHub secret and the password manager, then re-run the latest Deploy run. That run recreates `api`, and `deploy.sh` always restarts `web` after it, because nginx holds the old `api` address. If you restart `api` by hand, restart `web` after it.
- **The Tailscale trust credential:** make a new one, update `TS_OAUTH_CLIENT_ID` and `TS_AUDIENCE` and the password manager, then delete the old credential.

## What each alert means

The app has no public address, so it reports in and silence raises the alarm.

- **healthchecks.io "polls" check.** Create it by hand with a period of 1 hour and a grace of 30 minutes, which covers a deploy's drain. Put its ping URL in the `HEARTBEAT_URL` secret. `ingest` pings after every poll unless each adapter that ran failed. A poll where every adapter was skipped as not yet due still pings, because the first poll after a restart is like that. An email means 90 minutes with no such poll: `ingest` is stopped or hung, or every Job source that ran kept failing. Check `docker compose -f deploy/compose.prod.yaml --env-file .env logs --tail=100 ingest` on the Droplet. A failing ping is logged as `Heartbeat failed` and never stops a poll, so a ping error in the log with no email means healthchecks.io is the problem.
- **healthchecks.io "backups" check.** Create it by hand with a period of 1 day and a grace of a few hours, and put its ping URL in the `BACKUP_HEALTHCHECK_URL` secret. Only the nightly run of `deploy/backup.sh` pings it. An email means no backup landed that night: check `systemctl status copilot-backup` on the Droplet, then the [restore runbook](restore.md).
- **DigitalOcean disk alert.** `infra/monitoring.tf` emails `TF_VAR_alert_email`, which must be the verified email of a member of the DigitalOcean team, when disk use stays above 80% for 5 minutes. Run `docker system df` on the Droplet. Old images and the 10 MB x 3 container logs are the usual cause, then the Postgres volume.

An empty `HEARTBEAT_URL` logs a warning at boot and sends nothing, so local development needs no check.

## Check it

1. Push a code change. The Deploy run goes green, and `docker compose -f deploy/compose.prod.yaml --env-file .env ps` on the Droplet shows the new SHA in each image tag.
2. Push a change under `docs/` only. No Deploy run starts.
3. Run Deploy with the previous SHA, then check the tags again.
4. Search the run's logs for the value of each secret. None appears, because GitHub masks them and the script never prints `.env`.

---
type: gotcha
title: Backups
description: Details of backup.sh, restore-drill.sh and their test that look odd or would break a change, such as the signed curl upload, the test server that skips signature checks and the pre-deploy dump's volume check.
tags: [backups, ops, deploy]
sources: ["#38"]
generated:
  by: claude-opus-5-5
  at: 2026-11-09T18:00:00-05:00
---

The steps are in the [restore runbook](../runbooks/restore.md). These details would bite a change:

- Uploads use `curl --aws-sigv4` against B2's S3 endpoint, so the Droplet needs no AWS CLI. curl does not hash a file given with `-T`, so `backup.sh` sends `x-amz-content-sha256` itself. Without it the S3 API rejects the signature.
- The round-trip test (`scripts/backup.test.mjs`, part of `pnpm check`) runs against moto in Docker, which accepts any signature. It proves the dump, the encryption and the object layout, and not that B2 accepts the signed request. The drill against the real bucket proves that, so it must run once after the first real backup.
- The test needs `docker` and `age`. CI installs `age` with apt. It never skips, so a machine without them fails `pnpm check`.
- `deploy.sh` decides whether to dump by the `copilot_pgdata` volume, which comes from the Compose project name `copilot`. Rename the project and the dump is skipped without a message beyond "backup skipped".
- `backup.sh` sources `./.env` when the file exists, and a value there replaces one from the environment. The nightly unit runs from `~/copilot` for that reason. `.env` is single-quoted by `deploy.sh`, so sourcing it is safe.
- The plaintext dump exists on the Droplet's disk for the length of the run, in a mode 700 temp directory that a trap removes.
- A failed healthchecks.io ping does not fail the backup, because the dump is already uploaded. The missed ping is the alarm.
- The Droplet's key has no `readFiles`, so the drill needs a second key made by hand in B2. Terraform doesn't manage it.
- The drill counts only the tables in `DRILL_TABLES`. A new table holding data that can't be fetched again must be added to the script's default list, or the drill won't notice it missing.

---
type: runbook
title: Back up, run the restore drill and restore
description: How nightly and pre-deploy dumps are made and encrypted, the one-time setup, the restore drill on the Mac, and a full restore onto a new Droplet.
tags: [backups, ops, deploy]
sources: ["#38"]
generated:
  by: claude-opus-5-5
  at: 2026-11-09T18:00:00-05:00
---

Postgres is the only state. Master profile versions, the merge log, Tailored resumes and (later) Labels and Applications can't be fetched again, so they are what a restore must bring back. Decisions: [Personal data stays out of git](../decisions/personal-data-stays-out-of-git.md), [App runs in the cloud](../decisions/app-runs-in-the-cloud.md). Server setup: [Provision the server](provision.md).

## What runs

- `deploy/backup.sh` runs `pg_dump -Fc` inside the `copilot-postgres-1` container, encrypts the dump with the `age` public key, uploads `dumps/<UTC time>-<label>.dump.age` to the backups bucket with `curl --aws-sigv4`, then pings healthchecks.io when the label is `nightly`. It exits non-zero and prints `dump_bytes`, `encrypted_bytes`, `uploaded` and `pinged` if the dump is empty or the upload fails, and it pings only after an upload. A failed ping only warns, because the dump is safe.
- A systemd timer (`copilot-backup.timer`, from `infra/cloud-init.yaml`) runs it nightly at 03:30 Toronto time with the label `nightly`.
- `deploy/deploy.sh` runs it with the label `pre-deploy` before the migration. A failed dump stops the deploy. A pre-deploy run never pings, so daily deploys can't keep the check green while the timer is broken. The first deploy has no Postgres volume yet, so it skips the dump.
- The Droplet holds the public key and a B2 key with `listBuckets`, `listFiles` and `writeFiles` only. It can't read, delete or lift the Object Lock, so a stolen server can't read old dumps or wipe them. The private key lives on the Mac and in the password manager.

## One-time setup

1. `age-keygen -o ~/.config/copilot/backup-age.txt` on the Mac. Copy the file to the password manager. The `Public key:` line is `BACKUP_AGE_RECIPIENT`.
2. In healthchecks.io, make a check with a 1-day period and a grace time of a few hours, and note its ping URL.
3. In the `production` environment on GitHub, set the **variables** `BACKUP_AGE_RECIPIENT`, `BACKUP_S3_ENDPOINT` (`https://s3.<region>.backblazeb2.com`), `BACKUP_S3_REGION` (the `<region>` part) and `BACKUP_BUCKET`, and the **secrets** `BACKUP_KEY_ID` and `BACKUP_KEY` (from `terraform output`, see Rotating keys in [Provision the server](provision.md)) and `BACKUP_HEALTHCHECK_URL`. `deploy.sh` refuses to run without all seven, so set them before the next code push.
4. In B2, make a second application key for the Mac, limited to the backups bucket, with `listBuckets`, `listFiles` and `readFiles`. Terraform doesn't manage it, because its secret would sit in state next to the write key. Keep it in the password manager.
5. Install the timer on the running Droplet. cloud-init runs once, so a Droplet built before #38 lacks it. Open the Recovery Console (see [Provision the server](provision.md)) as `root`, then run `apt-get install -y age`, write the two units from `infra/cloud-init.yaml` into `/etc/systemd/system/`, and run `systemctl daemon-reload && systemctl enable --now copilot-backup.timer`. A Droplet built from the current cloud-init has all of this.
6. Push a code change, or re-run the latest Deploy, so `backup.sh` and the new `.env` reach the Droplet. Then `tailscale ssh deploy@copilot 'systemctl list-timers copilot-backup.timer'` shows the next run.

## Restore drill

Run it on the Mac, which needs `docker`, `age` and `curl`. Put the Mac's variables in a file outside the repo, never in a committed one. The names are in `.env.example`.

```sh
set -a; source ~/.config/copilot/backup.env; set +a
deploy/restore-drill.sh
```

It lists the bucket, picks the newest dump, decrypts it with `RESTORE_AGE_IDENTITY_FILE`, restores it into a throwaway `postgres:17` container and prints a row count per table in `DRILL_TABLES` (default `master_profile_version`, `merge_log_entry`, `tailored_resume`). It exits non-zero if the bucket holds no dump, `pg_restore` fails, a table is missing or all counts add up to 0. Add the Labels and Applications tables to the default list in the script when they exist.

Rerun the drill after any change to the schema, the keys or the bucket.

The result is not checked against production. A restored count below what the app shows is expected, because the dump is up to a day old.

## Full restore onto a new Droplet

1. Rebuild the server with the "Rebuild from nothing" steps in [Provision the server](provision.md). If the backups bucket was lost too, there is nothing to restore from, so stop here.
2. Run the Deploy workflow for the SHA that ran when the dump was made, or the latest SHA. With no volume, it starts an empty database and applies the migrations.
3. On the Mac, fetch and decrypt the dump you want. `RESTORE_DUMP_KEY` picks one by name instead of the newest:

   ```sh
   set -a; source ~/.config/copilot/backup.env; set +a
   RESTORE_SAVE_DUMP=/tmp/copilot.dump deploy/restore-drill.sh
   ```

   Check the drill's counts before going on. The file holds personal data, so delete it at the end.
4. Stop the writers, then restore into the live database. `--clean --if-exists` drops what the migrations just made, and the dump brings its own `_prisma_migrations` table back:

   ```sh
   RUN='cd ~/copilot && docker compose -f deploy/compose.prod.yaml --env-file .env'
   tailscale ssh deploy@copilot "$RUN stop web api ingest"
   tailscale ssh deploy@copilot "$RUN exec -T postgres pg_restore -U copilot -d copilot --clean --if-exists --no-owner --no-privileges --exit-on-error" < /tmp/copilot.dump
   tailscale ssh deploy@copilot "$RUN up -d --wait"
   ```

5. Re-run the latest Deploy, so any migration newer than the dump is applied.
6. Check the feed in the app and the counts with `psql`, then `rm /tmp/copilot.dump`.

At most 24 hours of Postings and merges are lost, and ingest refills them. Anything written by hand in that window is lost for good.

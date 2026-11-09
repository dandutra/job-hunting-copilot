---
type: runbook
title: Provision the server
description: Build, check, change and rebuild the Droplet, the Cloud Firewall, the Tailscale policy and the backups bucket with Terraform from the Mac, and get in through DigitalOcean's Recovery Console if Tailscale fails.
tags: [deploy, ops, terraform]
sources: ["#35"]
generated:
  by: claude-opus-5-5
  at: 2026-11-05T13:00:00-05:00
---

Terraform runs by hand from the Mac and never from CI, so the public repo's pipeline holds no infrastructure credentials. `infra/` holds the config. Decisions: [The app has no public address](../decisions/app-has-no-public-address.md), [App runs in the cloud](../decisions/app-runs-in-the-cloud.md).

## What Terraform manages

- A `s-1vcpu-2gb` Droplet in TOR1 with monitoring on and Droplet backups off.
- A Cloud Firewall with no inbound rules and all outbound allowed.
- The whole Tailscale policy (`tailscale_acl`), which replaces the tailnet's current one. `tag:server` is the Droplet, `tag:ci` is for the deploy workflow, and your own devices may reach `tag:server` and log in over Tailscale SSH as `deploy`.
- A single-use Tailscale auth key for the Droplet's first boot.
- The backups bucket with a 30-day lifecycle and a 30-day Object Lock in governance mode, and a B2 key that can list and write but not read. A write key can hide a file, and the lifecycle would delete it a day later. The lock is what keeps a stolen key from wiping the dumps. To delete a locked file early, you need a key with `bypassGovernance`, and the delete call must send the bypass flag (`b2 rm --bypass-governance`). File Lock can't be turned off once the bucket has it.

cloud-init (`infra/cloud-init.yaml` and `infra/first-boot.sh`) sets the timezone to America/Toronto, creates the `deploy` user, adds 1 GiB of swap, turns on `unattended-upgrades` with a reboot at 04:30, installs Docker and Tailscale, joins the tailnet with `--ssh` and `--operator=deploy`, and runs `tailscale serve --bg` to `127.0.0.1:8080`.

## Before the first apply

The accounts, the state bucket, the `age` key pair and `infra/.env` are in the checklist on #35. `infra/.env` needs exactly these names, whatever the keys are called in B2:

- `DIGITALOCEAN_TOKEN`, `TAILSCALE_API_KEY` and `TAILSCALE_TAILNET`.
- `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY`, for a key that can create buckets and keys.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, holding a B2 key ID and key that can read and write the state bucket. The S3 backend reads these.
- `TF_VAR_backups_bucket_name`, unique across all B2 accounts. B2 can't rename a bucket, and File Lock keeps it, so choose with care.

- `TF_VAR_alert_email`, the address for the disk alert. See [What each alert means](deploy.md#what-each-alert-means).

Don't set `B2_ENDPOINT`. The B2 provider reads it as its native API endpoint, so an S3 endpoint there fails the bucket create with `MissingSchema`. The S3 endpoint belongs only in `backend.hcl`. A name with a hyphen is skipped by `source`, so the variable is silently missing. Then:

```sh
cd infra
cp backend.hcl.example backend.hcl      # fill in the state bucket and its B2 endpoint
set -a; source .env; set +a
terraform init -backend-config=backend.hcl
terraform plan
```

Read the plan before applying. The Tailscale policy is replaced as a whole, so a device that needs access to another of your devices must match a rule in `infra/tailscale.tf`.

## First apply

```sh
terraform apply
```

`apply` prints the plan again and asks for `yes`. The first apply on 2026-11-05 proved two things the docs didn't confirm: `terraform init` works against B2 through the S3 backend, and the free Tailscale plan includes Serve.

If Serve or HTTPS is off, `tailscale serve` waits for a consent link instead of failing, so the script gives up after 60 seconds. The machine still joins the tailnet. Look for the link in `/var/log/cloud-init-output.log`, turn on HTTPS in the admin console's DNS page, then rerun the serve command from `infra/first-boot.sh` as `deploy` over Tailscale SSH. In that case `cloud-init status` reports `error`, which is expected.

First boot takes a few minutes. Watch the machine appear in the Tailscale admin console.

## Check it

1. `terraform plan` shows no changes.
2. From outside the tailnet, scan the public IP: `sudo nmap -Pn -p- -T4 --max-retries 1 "$(terraform output -raw droplet_ipv4)"`. Every port must be filtered. Turn Tailscale off on the Mac first, or the scan goes over the tailnet. Every probe times out, so the scan is slow and prints nothing until it ends; press Enter for progress. Without `sudo` and `-T4` it can take over an hour.
3. `tailscale ssh deploy@copilot` works, and `https://copilot.<tailnet>.ts.net` answers (a 502 is expected until the stack is deployed).
4. `deploy` has no sudo, so reboot from DigitalOcean: open the Droplet, then Power, then "Turn off", and then "Turn on". Turn off is a graceful shutdown, and a power cycle would cut Postgres off mid-write. Then `tailscale ssh deploy@copilot tailscale serve status` shows the same mapping.

Root tasks on the Droplet go through the Recovery Console below.

## Rebuild from nothing

1. Install Terraform, load `infra/.env` from the password manager and recreate `infra/backend.hcl` from the example.
2. `terraform init -backend-config=backend.hcl`. State is in B2, so Terraform knows what exists.
3. Delete the old machine in the Tailscale admin console. A second machine with the same name gets a `-1` suffix and the `*.ts.net` address changes.
4. Replace only the server: `terraform apply -replace=tailscale_tailnet_key.server -replace=digitalocean_droplet.app`. The key is replaced as well, because the old one is single-use and expired.
5. Deploy the stack from CI and restore the data with the restore runbook once it exists.

If the state is lost, import is not worth it.

1. Delete the Droplet and the firewall in DigitalOcean.
2. Delete the old Tailscale machine, as in step 3 above.
3. In B2, delete the old `copilot-backup-writer` application key. It is no longer in state, so it stays valid until you do.
4. Leave the backups bucket alone. Its files are locked for 30 days, and B2 won't delete a bucket that still has files.
5. Set `TF_VAR_backups_bucket_name` to a new name in `infra/.env` and the password manager, then apply from empty state.
6. Restore from the old bucket with a key that has `readFiles`. The Droplet's key can't read. Delete the old bucket once its last dump is older than 30 days and the lifecycle has emptied it.

## Recovery Console

The Droplet has no SSH key and port 22 is closed. If Tailscale is down:

1. In DigitalOcean, open the Droplet, then Access, then "Reset root password". DigitalOcean emails a new password and reboots the Droplet.
2. Open "Launch Recovery Console" on the same page and log in as `root` with that password. It asks for a new one at first login. "Launch Droplet Console" is a different button: it connects over SSH, so the firewall leaves it stuck on "connecting to droplet". The Recovery Console has not been tried yet.
3. Check `tailscale status` and `journalctl -u tailscaled`, and `tail /var/log/cloud-init-output.log` after a first-boot failure.

## Rotating keys

- The Tailscale API key lasts 90 days at most. Make a new one, update `infra/.env` and the password manager.
- The DigitalOcean token expires on its own date. Same steps.
- Read the backups key for the Droplet with `terraform output -raw backups_key`. It is stored in state too, so keep the state bucket private.

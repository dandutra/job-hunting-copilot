---
type: runbook
title: Provision the server
description: Build, check, change and rebuild the Droplet, the Cloud Firewall, the Tailscale policy and the backups bucket with Terraform from the Mac, and get in through DigitalOcean's Recovery Console if Tailscale fails.
tags: [deploy, ops, terraform]
sources: ["#35"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-03T12:00:00-05:00
---

Terraform runs by hand from the Mac and never from CI, so the public repo's pipeline holds no infrastructure credentials. `infra/` holds the config. Decisions: [The app has no public address](../decisions/app-has-no-public-address.md), [App runs in the cloud](../decisions/app-runs-in-the-cloud.md).

## What Terraform manages

- A `s-1vcpu-2gb` Droplet in TOR1 with monitoring on and Droplet backups off.
- A Cloud Firewall with no inbound rules and all outbound allowed.
- The whole Tailscale policy (`tailscale_acl`), which replaces the tailnet's current one. `tag:server` is the Droplet, `tag:ci` is for the deploy workflow, and your own devices may reach `tag:server` and log in over Tailscale SSH as `deploy`.
- A single-use Tailscale auth key for the Droplet's first boot.
- The backups bucket with a 30-day lifecycle and a 30-day Object Lock in governance mode, and a B2 key that can list and write but not read. A write key can hide a file, and the lifecycle would delete it a day later. The lock is what keeps a stolen key from wiping the dumps. To delete a locked file early, you need a key with `bypassGovernance`.

cloud-init (`infra/cloud-init.yaml` and `infra/first-boot.sh`) sets the timezone to America/Toronto, creates the `deploy` user, adds 1 GiB of swap, turns on `unattended-upgrades` with a reboot at 04:30, installs Docker and Tailscale, joins the tailnet with `--ssh` and `--operator=deploy`, and runs `tailscale serve --bg` to `127.0.0.1:8080`.

## Before the first apply

The accounts, the state bucket, the `age` key pair and `infra/.env` are in the checklist on #35. Then:

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

Two things were not confirmed by the docs and this apply proves them. If either fails, stop and report it on #35.

- `terraform init` works against B2 through the S3 backend.
- The free Tailscale plan includes Serve. If Serve or HTTPS is off, `tailscale serve` waits for a consent link instead of failing, so the script gives up after 60 seconds. The machine still joins the tailnet. Look for the link in `/var/log/cloud-init-output.log`, turn on HTTPS in the admin console's DNS page, then rerun the serve command from `infra/first-boot.sh` as `deploy` over Tailscale SSH.

First boot takes a few minutes. Watch the machine appear in the Tailscale admin console.

## Check it

1. `terraform plan` shows no changes.
2. From outside the tailnet, scan the public IP: `nmap -Pn -p- "$(terraform output -raw droplet_ipv4)"`. Every port must be filtered. Turn Tailscale off on the Mac first, or the scan goes over the tailnet.
3. `tailscale ssh deploy@copilot` works, and `https://copilot.<tailnet>.ts.net` answers (a 502 is expected until the stack is deployed).
4. `deploy` has no sudo, so reboot from DigitalOcean: open the Droplet, then Power, then "Power cycle". Then `tailscale ssh deploy@copilot tailscale serve status` shows the same mapping.

Root tasks on the Droplet go through the Recovery Console below.

## Rebuild from nothing

1. Install Terraform, load `infra/.env` from the password manager and recreate `infra/backend.hcl` from the example.
2. `terraform init -backend-config=backend.hcl`. State is in B2, so Terraform knows what exists.
3. Delete the old machine in the Tailscale admin console. A second machine with the same name gets a `-1` suffix and the `*.ts.net` address changes.
4. Replace only the server: `terraform apply -replace=tailscale_tailnet_key.server -replace=digitalocean_droplet.app`. The key is replaced as well, because the old one is single-use and expired.
5. Deploy the stack from CI and restore the data with the restore runbook once it exists.

If the state is lost, import is not worth it: delete the Droplet, the firewall and the backups bucket by hand, then apply from empty state. The bucket's old dumps are gone with it, so copy them out first.

## Recovery Console

The Droplet has no SSH key and port 22 is closed. If Tailscale is down:

1. In DigitalOcean, open the Droplet, then Access, then "Reset root password". DigitalOcean emails a new password and reboots the Droplet.
2. Open "Launch Droplet Console" on the same page and log in as `root` with that password. It asks for a new one at first login.
3. Check `tailscale status` and `journalctl -u tailscaled`, and `tail /var/log/cloud-init-output.log` after a first-boot failure.

## Rotating keys

- The Tailscale API key lasts 90 days at most. Make a new one, update `infra/.env` and the password manager.
- The DigitalOcean token expires on its own date. Same steps.
- Read the backups key for the Droplet with `terraform output -raw backups_key`. It is stored in state too, so keep the state bucket private.

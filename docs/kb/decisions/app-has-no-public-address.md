---
type: decision
title: The app has no public address
description: The UI and API are reachable only over Tailscale from the user's Mac, the Droplet accepts no inbound traffic, and the API rejects any request without the user's Tailscale identity.
tags: [deploy, security, ops]
sources: ["#17", "#8"]
generated:
  by: claude-opus-5-5
  at: 2026-11-02T13:50:00-05:00
---

The app holds the Master profile, Labels and Applications for one person, and that person uses it only from a Mac. The hosting research recommended Cloudflare Tunnel with Access because a phone had to open an alert with no app installed. Once the phone was dropped, that route's cost had no benefit left: a domain, a Tunnel, an Access app, service tokens and a second Terraform provider. An SSH port forward was rejected because it keeps port 22 open and an alert link fails unless a tunnel is running.

So the Droplet joins a tailnet and `tailscale serve` exposes the UI on a `*.ts.net` address. The DigitalOcean Cloud Firewall allows no inbound traffic, and Compose binds its one published port to `127.0.0.1`, because a port published on `0.0.0.0` bypasses `ufw`. CI reaches the Droplet the same way, as a temporary `tag:ci` node using Tailscale SSH, so GitHub stores no SSH key. DigitalOcean's Recovery Console is the way in if Tailscale fails.

The network isn't the only check, because one mistake such as turning on Funnel would expose everything. A global NestJS guard requires `Tailscale-User-Login` to equal the user's login and fails closed. Serve adds that identity to any request from the user's browser, including one a malicious website triggers, so a request that changes state must also have a matching or absent `Origin`. The cost is that the Tailscale app must stay connected on the Mac, and any other machine has to join the tailnet first. A return to a phone or a public demo would reopen this decision.

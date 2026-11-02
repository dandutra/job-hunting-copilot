---
type: decision
title: App runs in the cloud
description: The API, its ingest process, the JobSpy service, the UI and Postgres deploy with Docker Compose to a small cloud host, reachable only from the user's Mac over Tailscale.
tags: [deploy, ingestion, ops]
sources: ["#17"]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

Freshness is the reason this project exists, and it needs polling about every hour even while the Mac sleeps. A Mac-only setup misses postings overnight. The home server (Windows 11, native services, no Docker) was rejected because it shows the opposite of the container-and-deploy skills the cloud/ops Role family asks for.

The NestJS API and its ingest process, the JobSpy service, the UI and Postgres run on a 2 GiB DigitalOcean Droplet in Toronto with Docker Compose, deployed from CI. The UI is deployed too, so a Discord alert for an A-Tier Posting opens straight into it on the Mac. It has no public address ([The app has no public address](app-has-no-public-address.md)). Managed Postgres was rejected because it alone exceeds the budget of $5 to $15 a month, so nightly encrypted dumps to Backblaze B2 protect the data ([Deploy target and CI/CD pipeline](https://github.com/dandutra/job-hunting-copilot/issues/17)). That deploy is itself portfolio material.

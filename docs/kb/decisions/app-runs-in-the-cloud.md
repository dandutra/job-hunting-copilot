---
type: decision
title: App runs in the cloud
description: The API, its ingest process, the JobSpy service, the UI and Postgres deploy with Docker Compose to a small cloud host, with the UI behind single-user auth.
tags: [deploy, ingestion, ops]
generated:
  by: claude-opus-5-5
  at: 2026-10-29T15:00:00-04:00
---

Freshness is the reason this project exists, and it needs polling about every hour even while the Mac sleeps. A Mac-only setup misses postings overnight. The home server (Windows 11, native services, no Docker) was rejected because it shows the opposite of the container-and-deploy skills the cloud/ops Role family asks for.

The NestJS API and its ingest process, the JobSpy service, the UI and Postgres run on a small cloud host with Docker Compose, deployed from CI. The UI is deployed too, behind single-user auth, so a push alert for an A-tier Posting opens straight into it from a phone. That deploy is itself portfolio material.

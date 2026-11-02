---
type: gotcha
title: Production Compose stack
description: Four choices in deploy/compose.prod.yaml look wrong but are needed, and `ingest` is kept alive by a placeholder timer until the scheduler exists.
tags: [deploy, ops]
sources: ["#34"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-02T17:00:00-05:00
---

`deploy/compose.prod.yaml` starts every service. CI builds it and runs `up -d --wait` as the `smoke` job. These details broke it or would break it:

- `prisma` is a production dependency of `apps/api`, not a dev one. The `migrate` service runs `prisma migrate deploy` from the same image as `api`, and `pnpm prune --prod` would otherwise remove the CLI.
- `migrate` has `restart: "no"`. With the default policy it would loop, and `up --wait` would never see it exit.
- `ingest` has no HTTP listener. Its health check tests for `/tmp/ingest-started`, which `IngestHeartbeat` writes at start. The same class holds a timer, because a Nest application context with no listeners exits at once. Remove the timer when the hourly scheduler lands.
- nginx strips `/api` before proxying, so the API keeps its plain routes. `/health` returns 404 from `web`, and the Compose health checks reach the API directly.

The images are public. `deploy/check-images-clean.sh` fails the `smoke` job if any image holds a `data/` folder or a `.env` file outside `node_modules`. `.dockerignore` is the first guard and this script is the second, because a `COPY` of a wider path would slip past the first.

`POSTGRES_PASSWORD` goes into `DATABASE_URL`, so it must not contain `@ : / ? #`.

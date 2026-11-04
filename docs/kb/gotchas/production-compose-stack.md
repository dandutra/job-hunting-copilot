---
type: gotcha
title: Production Compose stack
description: Details of the production images and deploy/compose.prod.yaml that look wrong but are needed, such as the migrate restart policy, the file-based ingest health check and the nginx upstream lookup.
tags: [deploy, ops]
sources: ["#34"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-02T17:00:00-05:00
---

`deploy/compose.prod.yaml` starts every service. CI builds it and runs `up -d --wait` as the `smoke` job. These details broke it or would break it:

- `prisma` is a production dependency of `apps/api`, not a dev one. The `migrate` service runs `prisma migrate deploy` from the same image as `api`, and `pnpm prune --prod` would otherwise remove the CLI.
- `migrate` has `restart: "no"`. With the default policy it would loop, and `up --wait` would never see it exit.
- `ingest` has no HTTP listener. Its health check tests for `/tmp/ingest-started`, which `IngestHeartbeat` writes at start. The hourly interval in `IngestScheduler` is what keeps the process alive, because a Nest application context with no listeners exits at once.
- The `apps/api` build stage installs `openssl`, the same as the runtime stage. Prisma picks its schema engine by the OpenSSL it finds during `pnpm install`. Without it the image holds the 1.1.x engine, and every new `migrate` container downloads the 3.0.x engine from `binaries.prisma.sh`, so a Prisma outage fails the deploy. CI can't catch this, because its runners have internet access.
- nginx resolves `api` once, at start. A normal deploy recreates `web` too, because `IMAGE_TAG` changes its image. Recreating `api` alone, for example after a `POSTGRES_PASSWORD` change, leaves `/api/` returning 502 while `web` stays healthy, so restart `web` afterwards.
- nginx strips `/api` before proxying, so the API keeps its plain routes. `/health` returns 404 from `web`, and the Compose health checks reach the API directly.

The images are public. `deploy/check-images-clean.sh` fails the `smoke` job if any image holds a `data/` folder or a `.env` file outside `node_modules` and Python's `site-packages`, or if it can't list an image's files. `.dockerignore` is the first guard and this script is the second, because a `COPY` of a wider path would slip past the first.

`POSTGRES_PASSWORD` goes into `DATABASE_URL`, so it must not contain `@ : / ? #`.

---
type: decision
title: Ingestion lives in NestJS
description: One NestJS ingestion module polls every Job source through adapters and matches Sightings; the Python part only runs JobSpy behind POST /scrape.
tags: [ingestion, architecture]
sources: ["#9"]
generated:
  by: claude-opus-5-5
  at: 2026-10-30T12:00:00-04:00
---

Eight Job sources feed the app, and only JobSpy needs Python. Sighting matching has to see every Job source's Sightings in one place. Putting all ingestion in Python would have split the schema across two languages and moved the most interesting back-end logic out of the NestJS portfolio piece. Splitting by source would have put matching in two places.

So an ingestion module in `apps/api` holds one adapter per Job source. Each adapter turns its source's quirks into Sighting drafts, and matching only sees drafts. A second entrypoint, `ingest`, runs the hourly schedule as its own Compose service from the same image, so deploying the API never kills a poll. The JobSpy adapter pulls from `apps/jobspy`, a FastAPI service with one endpoint, `POST /scrape`, which has no schedule, no state and no database access. A board's 403 or 429 comes back as a 200 with an entry in `errors`, and a 500 means the scraper broke. Proxies are config on the Python side ([JobSpy from a cloud server](https://github.com/dandutra/job-hunting-copilot/issues/7)).

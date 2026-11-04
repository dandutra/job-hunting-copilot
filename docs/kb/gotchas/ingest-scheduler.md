---
type: gotcha
title: Ingest scheduler
description: How the hourly ingest poll stays safe to kill and rerun, and where its lock, drain and window rules would surprise a change.
tags: [ingestion, ops]
sources: ["#21"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-04T12:30:00-05:00
---

`IngestScheduler` in `apps/api/src/ingestion/` polls every adapter once an hour and hands each draft to `matchSighting`.

- The advisory lock (`pg_try_advisory_lock`) lives on a `pg` client opened for each tick, not on Prisma. A pooled connection can change between queries, so a lock taken through Prisma could be released early or never. Ending the client drops the lock. The lock also stops two `ingest` containers from polling together during a deploy.
- The drain runs in `onModuleDestroy`, because `PrismaService` disconnects in its own `onModuleDestroy`. A later hook such as `beforeApplicationShutdown` would find the database already closed. The Nest-level test in `ingest-scheduler.spec.ts` covers this order.
- A window advances (the `ingest_cursor` row) only after a poll with no `blocked` or `fault` error and no failed draft. A `bad-row` error does not hold it back, because asking again returns the same row. The next window starts 2 hours before the last good poll, defaults to 24 hours with no cursor, and never reaches back more than 7 days.
- Rerunning an adapter is safe because `matchSighting` updates the Sighting it already holds for a source and listing key. A crash mid-batch leaves some drafts matched and the cursor unmoved, and the rerun fills in the rest.
- The JobSpy adapter sends one request per poll, with a 5-minute client timeout, so a poll in progress fits inside the 6-minute `stop_grace_period`. A second search term per adapter would break that, so the search comes from `JOBSPY_SEARCH_TERM` and `JOBSPY_LOCATION`, one pair for both boards.
- A JobSpy row with a description is `full`, and one without is `none`. JobSpy never returns a snippet, and LinkedIn rows have no description while `linkedin_fetch_description` is off.
- The alert hook and `pollFinished` are log-only. The adapter calls the alert hook itself, so a fault raised inside an adapter alerts once, and one that escapes an adapter is alerted by the scheduler.

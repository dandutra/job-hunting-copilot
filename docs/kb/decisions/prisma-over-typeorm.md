---
type: decision
title: Prisma over TypeORM
description: The API uses Prisma for its schema, client and migrations, although TypeORM is closer to the Spring Data JPA the stack decision aims at.
tags: [stack, database]
sources: ["#9"]
generated:
  by: claude-opus-5-5
  at: 2026-10-30T12:00:00-04:00
---

[TypeScript stack with a Python worker](typescript-stack-with-python-worker.md) chose NestJS for its closeness to Spring, and TypeORM's entities and repositories would have carried that over to the database. The user read the TypeORM, Prisma and Drizzle docs and chose Prisma because they read its schema file and queries more easily. Prisma also has the stronger migration tooling. The cost is a drift from JPA's idioms.

The schema lives in `apps/api/prisma/schema.prisma`. The API and ingest processes are the only writers to Postgres, so there is one schema and one migration history.

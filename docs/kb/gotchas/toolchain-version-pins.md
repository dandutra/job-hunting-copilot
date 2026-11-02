---
type: gotcha
title: Toolchain version pins
description: Four packages are held below their newest release because the newest breaks the scaffold; unpin each only when its blocker is gone.
tags: [tooling, stack]
sources: ["#18"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-02T15:00:00-05:00
---

`pnpm add` takes the newest release, and four of them break `pnpm check` or `prisma`:

- **NestJS 11, not 12.** Nest 12 ships ES modules only. Jest 30 cannot `require()` them on Node below 24.9, so `@nestjs/testing` fails to load. Move to 12 together with a Node 24 pin or an ESM test setup.
- **TypeScript 6, not 7.** `typescript-eslint` throws on TypeScript 7.0, so `eslint` crashes. Wait for typescript-eslint support.
- **Prisma 7.10.1 for both `prisma` and `@prisma/client`.** The `latest` tag of `prisma` is an 8.0 release candidate, and the CLI and client versions must match.
- **Corepack is not used for pnpm.** Corepack failed to unpack pnpm 12 (`pnpm.cjs` missing). Install pnpm with Homebrew and keep the `packageManager` field in the root `package.json` in step.

Prisma 7 also reads the database URL from `apps/api/prisma.config.ts`, not from `schema.prisma`. The config loads the single `.env` at the repo root.

`compose.yaml` needs a Docker daemon and the Compose plugin. On a Mac without Docker Desktop, `brew install colima docker-compose` and `colima start` provide both.

---
type: gotcha
title: Toolchain version pins
description: NestJS, TypeScript and Prisma are held below their newest release, Node stays on 22 and Corepack is not used, each because the newer choice breaks the scaffold.
tags: [tooling, stack]
sources: ["#18", "#47"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-02T15:00:00-05:00
---

`pnpm add` takes the newest release, and these choices keep `pnpm install`, `pnpm check` and `prisma` working:

- **NestJS 11, not 12.** Nest 12 ships ES modules only. Jest 30 cannot `require()` them on Node below 24.9, so `@nestjs/testing` fails to load. Move to 12 together with a Node 24 pin or an ESM test setup.
- **TypeScript 6, not 7.** `typescript-eslint` throws on TypeScript 7.0, so `eslint` crashes. Wait for typescript-eslint support.
- **Prisma 7.10.1 for both `prisma` and `@prisma/client`.** The `latest` tag of `prisma` is an 8.0 release candidate, and the CLI and client versions must match.
- **Node 22, not 23.** The `prisma` preinstall script rejects Node 23.9, so `pnpm install` exits 1. `.nvmrc` names the tested version. The `engines` field documents the range, and pnpm does not enforce it here. Its floor is 22.22.2 because jsdom declares that floor and `vitest run` crashes on 22.12.
- **Corepack is not used for pnpm.** Corepack failed to unpack pnpm 12 (`pnpm.cjs` missing). Install pnpm with Homebrew and keep the `packageManager` field in the root `package.json` in step. CI installs the same version with `pnpm/action-setup`, which reads that field.

Prisma 7 also reads the database URL from `apps/api/prisma.config.ts`, not from `schema.prisma`. The config loads the single `.env` at the repo root.

`pnpm install` does not generate the Prisma client, so on a fresh clone `pnpm check` exits 1 at the API typecheck with `TS2305` on `PrismaClient`. Run `pnpm --dir apps/api exec prisma generate` after installing and after any `schema.prisma` change. The command needs `DATABASE_URL` set because `prisma.config.ts` calls `env("DATABASE_URL")`, but it never connects, so any non-empty value works.

`compose.yaml` needs a Docker daemon and the Compose plugin. On a Mac without Docker Desktop, `brew install colima docker-compose` and `colima start` provide both.

pnpm exits 1 with `ERR_PNPM_IGNORED_BUILDS` when a dependency has an install script that nobody approved, although the packages still land on disk. Approvals live under `allowBuilds` in `pnpm-workspace.yaml`.

The `dev` and `dev:ingest` scripts pass `--env-file ../../.env`, so copy `.env.example` to `.env` before `pnpm dev`. Without that file `pnpm dev` keeps running, but the API and `ingest` never start, and the only sign is a `not found` line in the log.

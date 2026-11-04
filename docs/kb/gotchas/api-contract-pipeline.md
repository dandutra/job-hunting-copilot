---
type: gotcha
title: API contract pipeline
description: How the committed OpenAPI specs and generated types stay in step, and the three places the pipeline bends around the pinned toolchain.
tags: [tooling, api]
sources: ["#20"]
generated:
  by: claude-sonnet-5-5
  at: 2026-11-04T12:00:00-05:00
---

`pnpm generate` rewrites four committed files in order: `apps/api/openapi.json`, `apps/jobspy/openapi.json`, `apps/web/src/api/schema.d.ts` (from the API spec) and `apps/api/src/ingestion/jobspy/schema.d.ts` (from the JobSpy spec). `pnpm check` starts with `pnpm generate:check`, which runs the generation, compares the four files with what was on disk, restores them (also when a step fails) and exits 1 if any differ. The API jest suite also compares `openapi.json` with the spec built from the DTOs, so a stale API spec fails `pnpm test` too. It compares with the working tree, not with `HEAD`, so commit the regenerated files with the DTO change.

- **Swagger needs decorator metadata.** The spec script runs under `ts-node --transpile-only`, not `tsx`, because esbuild drops `emitDecoratorMetadata` and `@ApiProperty()` then crashes on a property type. TypeScript 6 also needs `-O '{"rootDir":"."}'` there, or ts-node fails with `TS5011`.
- **`@nestjs/swagger` stays on 11.** Version 12 requires NestJS 12, which [Toolchain version pins](toolchain-version-pins.md) rules out.
- **Only decorated properties reach the spec.** The Swagger CLI plugin is off, so a DTO field without `@ApiProperty()` is missing from the spec and the check passes without noticing.
- The API serves its spec at `/docs-json` (UI at `/docs`) when `NODE_ENV` is not `production`.
- The web client uses base URL `/api`. nginx strips the prefix in production, and the Vite dev server proxy (`API_PORT`, default 3000) does the same.
- `@scarf/scarf` is set to `false` in `allowBuilds` because `@nestjs/swagger` pulls it in for telemetry only.

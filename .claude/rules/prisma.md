---
paths:
  - "apps/api/prisma/**"
  - "apps/api/prisma.config.ts"
---

# Prisma schema and migrations

A migration runs on production data on the next push to `main`, and `prisma migrate deploy` never undoes one.

- A migration keeps every existing row and keeps the previous image working, so a rollback stays possible. Removing or renaming a column takes two deploys: the migration rule in [Deploy, roll back and rotate secrets](../../docs/kb/runbooks/deploy.md).
- A migration that adds a constraint or changes a column backfills existing rows in the same migration, as the merge log's `reviewed_at` did ([Merge review API](../../docs/kb/gotchas/merge-review-api.md)).
- A new foreign key to `posting` decides what a merge does with the row, because a merge deletes the absorbed Posting ([Tailoring API](../../docs/kb/gotchas/tailoring-api.md)), and `resetTestDb` in `apps/api/test/test-db.ts` must delete the new table in a working order.
- After a schema change, run `pnpm --dir apps/api exec prisma generate` ([Toolchain version pins](../../docs/kb/gotchas/toolchain-version-pins.md)).

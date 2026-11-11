import { Prisma } from "@prisma/client";

const MATCHER_LOCK_ID = 2300023;

// Merges and splits reach Postings beyond one draft's keys, so one lock serialises every writer.
export async function lockMatcher(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MATCHER_LOCK_ID}::bigint)`;
}

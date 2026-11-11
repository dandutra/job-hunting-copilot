import { Prisma } from "@prisma/client";

const MATCHER_LOCK_ID = 2300023;
const TRANSACTION_TIMEOUT_MS = 60_000;

// Every transaction that holds the matcher lock can wait behind a long match.
export const LOCKED_TRANSACTION = {
  timeout: TRANSACTION_TIMEOUT_MS,
  maxWait: TRANSACTION_TIMEOUT_MS,
};

// Merges and splits reach Postings beyond one draft's keys, so one lock serialises every writer.
export async function lockMatcher(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MATCHER_LOCK_ID}::bigint)`;
}

import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const LABELS_LOCK_ID = 2300031;

// One user, but a double tap or two tabs must not draw or label twice.
export function underLabelsLock<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LABELS_LOCK_ID}::bigint)`;
    return fn(tx);
  });
}

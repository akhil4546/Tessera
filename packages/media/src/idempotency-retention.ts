import type { TesseraPrisma } from '@tessera/db';

/** Completed idempotency rows are kept for a day, then deleted. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A row with this status is an in-progress lock, not a stored response.
 * The table has no separate state column, so 0 means "still running".
 */
export const IDEMPOTENCY_PENDING_STATUS = 0;

/** Locks abandoned by a crashed request are released after this long. */
export const IDEMPOTENCY_PENDING_TTL_MS = 2 * 60 * 1000;

export type IdempotencyPurgeResult = { deleted: number };

export async function purgeIdempotencyRecords(
  prisma: TesseraPrisma,
  now = new Date(),
): Promise<IdempotencyPurgeResult> {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: {
      OR: [
        { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } },
        {
          status: IDEMPOTENCY_PENDING_STATUS,
          createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_PENDING_TTL_MS) },
        },
      ],
    },
  });
  return { deleted: result.count };
}

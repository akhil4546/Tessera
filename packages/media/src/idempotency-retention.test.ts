import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_PENDING_STATUS,
  IDEMPOTENCY_PENDING_TTL_MS,
  IDEMPOTENCY_TTL_MS,
  purgeIdempotencyRecords,
} from './idempotency-retention.ts';

describe('purgeIdempotencyRecords', () => {
  it('deletes finished rows after 24h and abandoned locks after 2 minutes', async () => {
    const now = new Date('2026-09-22T12:00:00.000Z');
    let where: unknown;
    const prisma = {
      idempotencyRecord: {
        deleteMany: async (args: { where: unknown }) => {
          where = args.where;
          return { count: 4 };
        },
      },
    };

    const result = await purgeIdempotencyRecords(prisma as never, now);

    expect(result).toEqual({ deleted: 4 });
    expect(where).toEqual({
      OR: [
        { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } },
        {
          status: IDEMPOTENCY_PENDING_STATUS,
          createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_PENDING_TTL_MS) },
        },
      ],
    });
    expect(IDEMPOTENCY_PENDING_TTL_MS).toBe(2 * 60 * 1000);
  });
});

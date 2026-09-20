import { describe, expect, it } from 'vitest';
import { RedisProbe } from './redis.probe.js';

describe('RedisProbe', () => {
  it('is a labelled soft-fail provider (boots even without Redis)', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const probe = new RedisProbe();
    await expect(probe.onModuleInit()).resolves.toBeUndefined();
  });
});

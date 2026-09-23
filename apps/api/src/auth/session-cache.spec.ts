import { Logger, type ExecutionContext } from '@nestjs/common';
import { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TTL_SECONDS } from '../common/cookies.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import {
  isAccountSuspended,
  sessionCacheKey,
  sessionCacheTtlSeconds,
  SessionCache,
} from './session-cache.js';
import type { TokenService } from './tokens.js';

const START = new Date('2026-09-22T12:00:00.000Z');
const BACKOFF_MS = 5_000;

type Entry = { value: string; expiresAtMs: number };
type EvalCall = { script: string; keys: string[]; args: string[] };

function liveRow(overrides?: {
  expiresAt?: Date;
  suspendedAt?: Date | null;
  suspensionEndsAt?: Date | null;
  deactivatedAt?: Date | null;
}) {
  return {
    expiresAt: overrides?.expiresAt ?? new Date(START.getTime() + 30 * 24 * 60 * 60 * 1000),
    user: {
      suspendedAt: overrides?.suspendedAt ?? null,
      suspensionEndsAt: overrides?.suspensionEndsAt ?? null,
      deactivatedAt: overrides?.deactivatedAt ?? null,
    },
  };
}

function prismaDouble() {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const updateMany = vi.fn();
  const prisma = { session: { findFirst, findMany, updateMany } } as unknown as PrismaService;
  return { prisma, findFirst, findMany, updateMany };
}

function captureLogs() {
  const warnings: string[] = [];
  const errors: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
    errors.push(String(message));
  });
  return { warnings, errors };
}

function installRedisDouble() {
  const store = new Map<string, Entry>();
  const errorHandlers: Array<(err: Error) => void> = [];
  const evalCalls: EvalCall[] = [];
  let failNext = 0;

  const readKey = (key: string): string | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  const writeKey = (key: string, value: string, ttlSeconds: number) => {
    store.set(key, { value, expiresAtMs: Date.now() + ttlSeconds * 1000 });
  };

  vi.spyOn(Redis.prototype, 'on').mockImplementation(function on(
    this: Redis,
    event: string | symbol,
    listener: (...args: unknown[]) => void,
  ) {
    if (event === 'error') errorHandlers.push(listener);
    return this;
  } as never);
  vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
  vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined);
  vi.spyOn(Redis.prototype, 'eval').mockImplementation((...raw: unknown[]) => {
    const script = String(raw[0]);
    const numKeys = Number(raw[1]);
    const keys = raw.slice(2, 2 + numKeys).map(String);
    const args = raw.slice(2 + numKeys).map(String);
    evalCalls.push({ script, keys, args });
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('connection reset');
    }
    if (script.includes('session-cache-read')) {
      return Promise.resolve([readKey(keys[0] ?? ''), readKey(keys[1] ?? '') ?? '0']);
    }
    if (script.includes('session-cache-fill')) {
      if (readKey(keys[0] ?? '') === '0') return Promise.resolve(0);
      const gen = readKey(keys[1] ?? '') ?? '0';
      if (gen !== args[0]) return Promise.resolve(0);
      writeKey(keys[0] ?? '', args[1] ?? '', Number(args[2]));
      return Promise.resolve(1);
    }
    if (script.includes('session-cache-tombstone')) {
      const ttl = Number(args[0]);
      for (const key of keys) writeKey(key, '0', ttl);
      return Promise.resolve(keys.length);
    }
    if (script.includes('session-cache-generation')) {
      const next = Number(readKey(keys[0] ?? '') ?? '0') + 1;
      writeKey(keys[0] ?? '', String(next), Number(args[0]));
      return Promise.resolve(next);
    }
    throw new Error(`unexpected session-cache script: ${script.slice(0, 40)}`);
  });

  return {
    evalCalls,
    errorHandlers,
    fail(times = 1) {
      failNext += times;
    },
    evalCount() {
      return evalCalls.length;
    },
    seed(key: string, value: string, ttlSeconds = 60) {
      writeKey(key, value, ttlSeconds);
    },
    get(key: string) {
      return readKey(key);
    },
  };
}

function fillCall(calls: EvalCall[]): EvalCall | undefined {
  return calls.find((call) => call.script.includes('session-cache-fill'));
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('timed out waiting for the session lookup');
}

function bearerContext(req: { headers: Record<string, string>; user?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

function tokensDouble() {
  const verifyAccess = vi.fn().mockResolvedValue({ sub: 'user-1', sid: 'sid-1', hdl: 'ada' });
  return { tokens: { verifyAccess } as unknown as TokenService, verifyAccess };
}

describe('session cache bounds', () => {
  it('caps the positive ttl at 60 seconds and at the access token', () => {
    const now = START.getTime();
    const longLived = sessionCacheTtlSeconds(new Date(now + 30 * 24 * 60 * 60 * 1000), now);
    expect(longLived).toBe(Math.min(60, ACCESS_TTL_SECONDS));
    expect(longLived).toBeLessThanOrEqual(60);
    expect(longLived).toBeLessThanOrEqual(ACCESS_TTL_SECONDS);
    expect(sessionCacheTtlSeconds(new Date(now + 10_000), now)).toBe(10);
    expect(sessionCacheTtlSeconds(new Date(now - 1_000), now)).toBe(0);
  });

  it('re-checks a timed suspension against now instead of a cached boolean', () => {
    const suspended = { suspendedAt: new Date(START.getTime() - 60_000), suspensionEndsAt: null };
    expect(isAccountSuspended(suspended, START)).toBe(true);
    const ending = {
      suspendedAt: new Date(START.getTime() - 60_000),
      suspensionEndsAt: new Date(START.getTime() + 60_000),
    };
    expect(isAccountSuspended(ending, START)).toBe(true);
    expect(isAccountSuspended(ending, new Date(START.getTime() + 60_001))).toBe(false);
    expect(isAccountSuspended({ suspendedAt: null, suspensionEndsAt: null }, START)).toBe(false);
  });
});

describe('SessionCache', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it('hits Postgres on every request and warns once when Redis is unset', async () => {
    delete process.env.REDIS_URL;
    const connect = vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    const logs = captureLogs();
    const { prisma, findFirst } = prismaDouble();
    findFirst.mockResolvedValue(liveRow());
    const cache = new SessionCache(prisma);

    await cache.resolve('sid-1', 'user-1');
    await cache.resolve('sid-1', 'user-1');

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(connect).not.toHaveBeenCalled();
    const degraded = logs.warnings.filter(
      (line) => line.includes('DEGRADED') && line.includes('Postgres'),
    );
    expect(degraded).toHaveLength(1);
    await cache.onModuleDestroy();
  });

  describe('when Redis is configured', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
    });

    it('serves the second request from Redis and joins account status into one query', async () => {
      const redis = installRedisDouble();
      const { prisma, findFirst } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      const cache = new SessionCache(prisma);

      const first = await cache.resolve('sid-1', 'user-1');
      const second = await cache.resolve('sid-1', 'user-1');

      expect(first?.userId).toBe('user-1');
      expect(second?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'sid-1',
          userId: 'user-1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        select: {
          expiresAt: true,
          user: { select: { suspendedAt: true, suspensionEndsAt: true, deactivatedAt: true } },
        },
      });
      const fill = fillCall(redis.evalCalls);
      expect(fill).toBeDefined();
      const ttl = Number(fill?.args[2]);
      expect(ttl).toBe(Math.min(60, ACCESS_TTL_SECONDS));
      expect(ttl).toBeLessThanOrEqual(60);
      expect(ttl).toBeLessThanOrEqual(ACCESS_TTL_SECONDS);
      const tombstoneAt = fill?.script.indexOf("== '0'") ?? -1;
      const setAt = fill?.script.indexOf("redis.call('SET'") ?? -1;
      expect(tombstoneAt).toBeGreaterThanOrEqual(0);
      expect(setAt).toBeGreaterThan(tombstoneAt);
      const stored = JSON.parse(redis.get(sessionCacheKey('sid-1')) ?? 'null') as {
        deactivatedAt: unknown;
      };
      expect(stored.deactivatedAt).toBeNull();
      await cache.onModuleDestroy();
    });

    it('uses the time left on the session when that is under 60 seconds', async () => {
      const redis = installRedisDouble();
      const { prisma, findFirst } = prismaDouble();
      findFirst.mockResolvedValue(liveRow({ expiresAt: new Date(START.getTime() + 10_000) }));
      const cache = new SessionCache(prisma);

      await cache.resolve('sid-1', 'user-1');

      expect(fillCall(redis.evalCalls)?.args[2]).toBe('10');
      await cache.onModuleDestroy();
    });

    it('does not serve a cached session after it is revoked, even if Postgres still looks live', async () => {
      const redis = installRedisDouble();
      const { prisma, findFirst } = prismaDouble();
      let release: (row: ReturnType<typeof liveRow>) => void = () => undefined;
      const gate = new Promise<ReturnType<typeof liveRow>>((resolve) => {
        release = resolve;
      });
      findFirst.mockImplementationOnce(() => gate);
      const cache = new SessionCache(prisma);

      const pending = cache.resolve('sid-1', 'user-1');
      await until(() => findFirst.mock.calls.length === 1);
      await cache.invalidateSessions(['sid-1']);
      release(liveRow());

      await expect(pending).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(1);
      const tomb = redis.evalCalls.find((call) => call.script.includes('session-cache-tombstone'));
      expect(tomb?.args[0]).toBe(String(ACCESS_TTL_SECONDS));
      expect(Number(tomb?.args[0])).toBeLessThanOrEqual(ACCESS_TTL_SECONDS);
      await expect(cache.resolve('sid-1', 'user-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(1);
      await cache.onModuleDestroy();
    });

    it('keeps other devices cached when only one session is revoked', async () => {
      const { prisma, findFirst, findMany, updateMany } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      findMany.mockResolvedValue([{ id: 'sid-1', userId: 'user-1' }]);
      updateMany.mockResolvedValue({ count: 1 });
      const cache = new SessionCache(prisma);
      installRedisDouble();

      await cache.resolve('sid-1', 'user-1');
      await cache.resolve('sid-2', 'user-1');
      await cache.revokeWhere({ id: 'sid-1', userId: 'user-1' }, 'session');
      const other = await cache.resolve('sid-2', 'user-1');

      expect(other?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(2);
      await expect(cache.resolve('sid-1', 'user-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(2);
      await cache.onModuleDestroy();
    });

    it('drops a session that was cached during a bulk revoke but missed the id list', async () => {
      const redis = installRedisDouble();
      const { prisma, findFirst, findMany, updateMany } = prismaDouble();
      findFirst.mockResolvedValueOnce(liveRow()).mockResolvedValueOnce(null);
      findMany.mockResolvedValue([]);
      updateMany.mockResolvedValue({ count: 1 });
      const cache = new SessionCache(prisma);

      await cache.resolve('sid-race', 'user-1');
      await cache.revokeWhere({ userId: 'user-1' }, 'user', 'user-1');

      await expect(cache.resolve('sid-race', 'user-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(2);
      const bump = redis.evalCalls.find((call) => call.script.includes('session-cache-generation'));
      const incrAt = bump?.script.indexOf("redis.call('INCR'") ?? -1;
      const expireAt = bump?.script.indexOf("redis.call('EXPIRE'") ?? -1;
      expect(incrAt).toBeGreaterThanOrEqual(0);
      expect(expireAt).toBeGreaterThan(incrAt);
      expect(bump?.args[0]).toBe(String(ACCESS_TTL_SECONDS));
      await cache.onModuleDestroy();
    });

    it('does not bump the generation until the revoke is committed', async () => {
      const { prisma, findFirst, findMany, updateMany } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      findMany.mockResolvedValue([{ id: 'sid-1', userId: 'user-1' }]);
      let release: (result: { count: number }) => void = () => undefined;
      updateMany.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const cache = new SessionCache(prisma);
      installRedisDouble();
      await cache.resolve('sid-1', 'user-1');

      const revoking = cache.revokeWhere({ userId: 'user-1' }, 'user', 'user-1');
      await until(() => updateMany.mock.calls.length === 1);
      const during = await cache.resolve('sid-1', 'user-1');
      expect(during?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(1);

      release({ count: 1 });
      await revoking;
      findFirst.mockResolvedValue(null);
      await expect(cache.resolve('sid-1', 'user-1')).resolves.toBeNull();
      await cache.onModuleDestroy();
    });

    it('reloads a session that is still valid after other sessions were revoked', async () => {
      const { prisma, findFirst, findMany, updateMany } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      findMany.mockResolvedValue([{ id: 'sid-other', userId: 'user-1' }]);
      updateMany.mockResolvedValue({ count: 1 });
      const cache = new SessionCache(prisma);
      installRedisDouble();

      await cache.resolve('sid-current', 'user-1');
      await cache.resolve('sid-other', 'user-1');
      await cache.revokeWhere({ userId: 'user-1', id: { not: 'sid-current' } }, 'user', 'user-1');
      const current = await cache.resolve('sid-current', 'user-1');
      await cache.resolve('sid-current', 'user-1');

      expect(current?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(3);
      await expect(cache.resolve('sid-other', 'user-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledTimes(3);
      await cache.onModuleDestroy();
    });

    it('treats a cached expiry or a different user as unusable', async () => {
      const redis = installRedisDouble();
      const { prisma, findFirst } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      const cache = new SessionCache(prisma);
      redis.seed(
        sessionCacheKey('sid-old'),
        JSON.stringify({
          v: 1,
          gen: 0,
          userId: 'user-1',
          expiresAt: new Date(START.getTime() - 1_000).toISOString(),
          suspendedAt: null,
          suspensionEndsAt: null,
          deactivatedAt: null,
        }),
      );
      redis.seed(
        sessionCacheKey('sid-other-user'),
        JSON.stringify({
          v: 1,
          gen: 0,
          userId: 'user-2',
          expiresAt: new Date(START.getTime() + 60_000).toISOString(),
          suspendedAt: null,
          suspensionEndsAt: null,
          deactivatedAt: null,
        }),
      );

      await expect(cache.resolve('sid-old', 'user-1')).resolves.toBeNull();
      const replaced = await cache.resolve('sid-other-user', 'user-1');

      expect(replaced?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(1);
      await cache.onModuleDestroy();
    });

    it('falls back to Postgres when Redis fails and does not serve a tuple it could not invalidate', async () => {
      const redis = installRedisDouble();
      const logs = captureLogs();
      const { prisma, findFirst } = prismaDouble();
      findFirst.mockResolvedValue(liveRow());
      const cache = new SessionCache(prisma);

      await cache.resolve('sid-1', 'user-1');
      redis.fail(1);
      await cache.invalidateSessions(['sid-1']);
      expect(
        logs.errors.some((line) => line.includes('DEGRADED') && line.includes('Postgres')),
      ).toBe(true);

      const duringOutage = redis.evalCount();
      vi.setSystemTime(START.getTime() + BACKOFF_MS - 1);
      for (const handler of redis.errorHandlers) handler(new Error('still down'));
      findFirst.mockResolvedValue(null);
      await expect(cache.resolve('sid-2', 'user-2')).resolves.toBeNull();
      expect(redis.evalCount()).toBe(duringOutage);

      vi.setSystemTime(START.getTime() + BACKOFF_MS);
      await expect(cache.resolve('sid-1', 'user-1')).resolves.toBeNull();
      expect(redis.evalCount()).toBe(duringOutage + 1);
      expect(logs.warnings.some((line) => line.includes('reachable again'))).toBe(true);

      await cache.resolve('sid-2', 'user-2');
      expect(redis.evalCount()).toBe(duringOutage + 1);

      vi.setSystemTime(START.getTime() + 61_000);
      findFirst.mockResolvedValue(liveRow());
      const restored = await cache.resolve('sid-3', 'user-1');
      const again = await cache.resolve('sid-3', 'user-1');
      expect(restored?.userId).toBe('user-1');
      expect(again?.userId).toBe('user-1');
      expect(findFirst).toHaveBeenCalledTimes(5);
      await cache.onModuleDestroy();
    });
  });
});

describe('auth guards use the session cache', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it('does not query the session again on the next authenticated request', async () => {
    installRedisDouble();
    const { prisma, findFirst } = prismaDouble();
    findFirst.mockResolvedValue(liveRow());
    const cache = new SessionCache(prisma);
    const { tokens } = tokensDouble();
    const guard = new AuthGuard(tokens, cache);
    const req = { headers: { authorization: 'Bearer access-token' } };
    const context = bearerContext(req);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(req).toMatchObject({ user: { id: 'user-1', handle: 'ada', sessionId: 'sid-1' } });
    expect(findFirst).toHaveBeenCalledTimes(1);
    await cache.onModuleDestroy();
  });

  it('keeps a suspension in force from the cache, then allows it once the end time has passed', async () => {
    installRedisDouble();
    const { prisma, findFirst } = prismaDouble();
    const ends = new Date(START.getTime() + 30_000);
    findFirst.mockResolvedValue(
      liveRow({ suspendedAt: new Date(START.getTime() - 1_000), suspensionEndsAt: ends }),
    );
    const cache = new SessionCache(prisma);
    const { tokens } = tokensDouble();
    const guard = new AuthGuard(tokens, cache);
    const context = bearerContext({ headers: { authorization: 'Bearer access-token' } });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(findFirst).toHaveBeenCalledTimes(1);

    vi.setSystemTime(ends.getTime() + 1);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
    await cache.onModuleDestroy();
  });

  it('still rejects an open-ended suspension after the cache window moves forward', async () => {
    installRedisDouble();
    const { prisma, findFirst } = prismaDouble();
    findFirst.mockResolvedValue(liveRow({ suspendedAt: START, suspensionEndsAt: null }));
    const cache = new SessionCache(prisma);
    const guard = new AuthGuard(tokensDouble().tokens, cache);
    const context = bearerContext({ headers: { authorization: 'Bearer access-token' } });

    vi.setSystemTime(START.getTime() + 10 * 60_000);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(findFirst).toHaveBeenCalledTimes(1);
    await cache.onModuleDestroy();
  });

  it('lets optional auth reuse the cache without rejecting a suspended account', async () => {
    installRedisDouble();
    const { prisma, findFirst } = prismaDouble();
    findFirst.mockResolvedValue(liveRow({ suspendedAt: START, suspensionEndsAt: null }));
    const cache = new SessionCache(prisma);
    const { tokens, verifyAccess } = tokensDouble();
    const optional = new OptionalAuthGuard(tokens, cache);
    const req = { headers: { authorization: 'Bearer access-token' } };

    await expect(optional.canActivate(bearerContext(req))).resolves.toBe(true);
    await expect(optional.canActivate(bearerContext(req))).resolves.toBe(true);
    expect(req).toMatchObject({ user: { id: 'user-1', handle: 'ada', sessionId: 'sid-1' } });
    expect(findFirst).toHaveBeenCalledTimes(1);

    verifyAccess.mockRejectedValueOnce(new Error('bad token'));
    const ignored = { headers: { authorization: 'Bearer no' } };
    await expect(optional.canActivate(bearerContext(ignored))).resolves.toBe(true);
    expect(ignored).not.toHaveProperty('user');

    const signedOut = new AuthGuard(tokens, cache);
    await expect(signedOut.canActivate(bearerContext({ headers: {} }))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await cache.onModuleDestroy();
  });
});

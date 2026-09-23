import { Logger, type ArgumentsHost } from '@nestjs/common';
import { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorFilter } from './http-filter.js';
import { TesseraHttpError } from './http-error.js';
import { RateLimitService } from './rate-limit.js';

const START = new Date('2026-09-22T12:00:00.000Z');
const BACKOFF_MS = 5_000;
const BACKOFF_MAX_MS = 30_000;

type Bucket = { count: number; ttlMs: number };
type ResponseLike = {
  setHeader: (name: string, value: string | number) => ResponseLike;
  status: (code: number) => ResponseLike;
  json: (body: unknown) => ResponseLike;
};

function textArg(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new Error('unexpected redis arg');
}

function retryHeader(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('headers' in err)) return undefined;
  const headers = (err as { headers?: Record<string, string> }).headers;
  return headers?.['Retry-After'];
}

async function rejection(promise: Promise<unknown>): Promise<TesseraHttpError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(TesseraHttpError);
    return err as TesseraHttpError;
  }
  throw new Error('expected a rate-limit error');
}

function recordResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: unknown;
  const res: ResponseLike = {
    setHeader(name, value) {
      headers[name] = String(value);
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      body = payload;
      return res;
    },
  };
  return {
    res,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function hostFor(res: ResponseLike): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as ArgumentsHost;
}

function installRedisDouble() {
  const commands: string[] = [];
  const buckets = new Map<string, Bucket>();
  const errorHandlers: Array<(err: Error) => void> = [];
  let failNext = 0;
  let lastScript = '';
  let lastWindowMs = '';

  const bucketFor = (key: string): Bucket => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, ttlMs: -1 };
      buckets.set(key, bucket);
    }
    return bucket;
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
  vi.spyOn(Redis.prototype, 'incr').mockImplementation((key) => {
    commands.push('incr');
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('connection reset');
    }
    const bucket = bucketFor(String(key));
    bucket.count += 1;
    return Promise.resolve(bucket.count);
  });
  vi.spyOn(Redis.prototype, 'expire').mockImplementation((key, seconds) => {
    commands.push('expire');
    bucketFor(String(key)).ttlMs = Number(seconds) * 1000;
    return Promise.resolve(1);
  });
  vi.spyOn(Redis.prototype, 'eval').mockImplementation((...args: unknown[]) => {
    commands.push('eval');
    lastScript = textArg(args[0]);
    if (Number(args[1]) !== 1 || args[2] === undefined || args[3] === undefined) {
      throw new Error(`unexpected eval args: ${args.length}`);
    }
    lastWindowMs = textArg(args[3]);
    if (failNext > 0) {
      failNext -= 1;
      throw new Error('connection reset');
    }
    const bucket = bucketFor(textArg(args[2]));
    bucket.count += 1;
    const windowMs = Number(textArg(args[3]));
    if (bucket.ttlMs < 0) bucket.ttlMs = windowMs;
    return Promise.resolve([bucket.count, bucket.ttlMs]);
  });

  return {
    commands,
    buckets,
    errorHandlers,
    fail(times = 1) {
      failNext += times;
    },
    get lastScript() {
      return lastScript;
    },
    get lastWindowMs() {
      return lastWindowMs;
    },
    evalCount() {
      return commands.filter((command) => command === 'eval').length;
    },
  };
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

describe('RateLimitService', () => {
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

  it('limits in memory and sends Retry-After for the time left in the window', async () => {
    delete process.env.REDIS_URL;
    captureLogs();
    const limit = new RateLimitService();
    const start = Date.now();
    await limit.consume('memory:1', 1, 10);

    const first = await rejection(limit.consume('memory:1', 1, 10));
    expect(first.getStatus()).toBe(429);
    expect(first.code).toBe('RATE_LIMIT');
    expect(retryHeader(first)).toBe('10');

    const recorded = recordResponse();
    new HttpErrorFilter().catch(first, hostFor(recorded.res));
    expect(recorded.statusCode).toBe(429);
    expect(recorded.headers['Retry-After']).toBe('10');
    expect(recorded.body).toEqual({
      error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' },
    });

    vi.setSystemTime(start + 4_000);
    const later = await rejection(limit.consume('memory:1', 1, 10));
    expect(retryHeader(later)).toBe('6');

    vi.setSystemTime(start + 10_000);
    await limit.consume('memory:1', 1, 10);
    await limit.onModuleDestroy();
  });

  it('does not add Retry-After to other errors', () => {
    const recorded = recordResponse();
    new HttpErrorFilter().catch(
      new TesseraHttpError(404, 'NOT_FOUND', 'Missing'),
      hostFor(recorded.res),
    );
    expect(recorded.statusCode).toBe(404);
    expect(recorded.headers['Retry-After']).toBeUndefined();
    expect(recorded.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Missing' } });
  });

  it('logs once that the in-memory limiter is non-authoritative when Redis is unset', async () => {
    delete process.env.REDIS_URL;
    const connect = vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    const logs = captureLogs();
    const limit = new RateLimitService();
    await limit.consume('local:1', 5, 60);
    await limit.consume('local:1', 5, 60);
    const degraded = logs.warnings.filter((line) => line.includes('non-authoritative'));
    expect(degraded).toHaveLength(1);
    expect(degraded[0]).toContain('DEGRADED');
    expect(connect).not.toHaveBeenCalled();
    await limit.onModuleDestroy();
  });

  describe('when Redis is configured', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
    });

    it('counts in one Redis script and sends Retry-After from the key TTL', async () => {
      const redis = installRedisDouble();
      const logs = captureLogs();
      const limit = new RateLimitService();
      await limit.consume('post:user', 1, 60);
      expect(redis.lastWindowMs).toBe('60000');
      const script = redis.lastScript;
      const incrAt = script.indexOf("redis.call('INCR'");
      const guardAt = script.indexOf('ttl < 0');
      const pexpireAt = script.indexOf("redis.call('PEXPIRE'");
      expect(incrAt).toBeGreaterThanOrEqual(0);
      expect(guardAt).toBeGreaterThan(incrAt);
      expect(pexpireAt).toBeGreaterThan(guardAt);
      expect(script).toContain("redis.call('PTTL'");
      expect(redis.commands).toEqual(['eval']);

      const bucket = redis.buckets.get('post:user');
      expect(bucket?.ttlMs).toBe(60_000);
      bucket!.ttlMs = 2_500;
      const limited = await rejection(limit.consume('post:user', 1, 60));
      expect(retryHeader(limited)).toBe('3');
      expect(redis.commands).toEqual(['eval', 'eval']);
      expect(logs.errors).toEqual([]);

      const recorded = recordResponse();
      new HttpErrorFilter().catch(limited, hostFor(recorded.res));
      expect(recorded.headers['Retry-After']).toBe('3');
      await limit.onModuleDestroy();
    });

    it('probes Redis again after backoff instead of disabling it for the process', async () => {
      const redis = installRedisDouble();
      const logs = captureLogs();
      const limit = new RateLimitService();
      const start = Date.now();

      redis.fail(1);
      await limit.consume('login:1', 10, 60);
      expect(redis.evalCount()).toBe(1);
      expect(logs.errors.filter((line) => line.includes('non-authoritative'))).toHaveLength(1);
      expect(logs.errors[0]).toContain('DEGRADED');

      vi.setSystemTime(start + 4_000);
      for (const handler of redis.errorHandlers) handler(new Error('still down'));
      await limit.consume('login:2', 10, 60);
      expect(redis.evalCount()).toBe(1);
      expect(logs.errors.filter((line) => line.includes('non-authoritative'))).toHaveLength(1);

      vi.setSystemTime(start + BACKOFF_MS - 1);
      await limit.consume('login:3', 10, 60);
      expect(redis.evalCount()).toBe(1);

      vi.setSystemTime(start + BACKOFF_MS);
      await limit.consume('login:4', 10, 60);
      expect(redis.evalCount()).toBe(2);
      expect(logs.warnings.some((line) => /authoritative again/.test(line))).toBe(true);
      expect(redis.commands.every((command) => command === 'eval')).toBe(true);

      redis.fail(1);
      await limit.consume('login:5', 10, 60);
      expect(redis.evalCount()).toBe(3);

      vi.setSystemTime(start + BACKOFF_MS + BACKOFF_MS);
      redis.fail(1);
      await limit.consume('login:6', 10, 60);
      expect(redis.evalCount()).toBe(4);

      vi.setSystemTime(start + BACKOFF_MS + BACKOFF_MS + BACKOFF_MS);
      await limit.consume('login:7', 10, 60);
      expect(redis.evalCount()).toBe(4);

      vi.setSystemTime(start + BACKOFF_MS * 4);
      await limit.consume('login:8', 10, 60);
      expect(redis.evalCount()).toBe(5);
      await limit.onModuleDestroy();
    });

    it('stops lengthening the Redis backoff at 30 seconds', async () => {
      const redis = installRedisDouble();
      captureLogs();
      const limit = new RateLimitService();
      const start = Date.now();
      let t = 0;
      let backoff = BACKOFF_MS;

      for (let i = 0; i < 6; i++) {
        redis.fail(1);
        const before = redis.evalCount();
        await limit.consume(`cap:${i}`, 100, 60);
        expect(redis.evalCount()).toBe(before + 1);

        t += backoff - 1;
        vi.setSystemTime(start + t);
        await limit.consume(`cap-wait:${i}`, 100, 60);
        expect(redis.evalCount()).toBe(before + 1);

        t += 1;
        vi.setSystemTime(start + t);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      }

      expect(backoff).toBe(BACKOFF_MAX_MS);
      redis.fail(1);
      const before = redis.evalCount();
      await limit.consume('cap:last', 100, 60);
      expect(redis.evalCount()).toBe(before + 1);

      t += BACKOFF_MAX_MS - 1;
      vi.setSystemTime(start + t);
      await limit.consume('cap:last-wait', 100, 60);
      expect(redis.evalCount()).toBe(before + 1);

      t += 1;
      vi.setSystemTime(start + t);
      await limit.consume('cap:probe', 100, 60);
      expect(redis.evalCount()).toBe(before + 2);
      await limit.onModuleDestroy();
    });
  });
});

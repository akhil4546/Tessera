import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { TesseraHttpError } from './http-error.js';

/** First wait after Redis fails. Consecutive failures double this, up to the max. */
const REDIS_BACKOFF_MS = 5_000;
const REDIS_BACKOFF_MAX_MS = 30_000;

/**
 * One round trip. INCR and PEXPIRE cannot be split by a crash.
 * PEXPIRE runs only when the key has no TTL (PTTL < 0), including a leaked key.
 */
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`.trim();

type Bucket = { count: number; resetAt: number };
type Circuit = 'closed' | 'open';

function retryAfterSeconds(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 1;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function rateLimited(remainingMs: number): TesseraHttpError {
  return new TesseraHttpError(429, 'RATE_LIMIT', 'Too many attempts. Try again later.', {
    'Retry-After': String(retryAfterSeconds(remainingMs)),
  });
}

function readEval(result: unknown): { count: number; ttlMs: number } {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('rate limit script returned an unexpected value');
  }
  const count = Number(result[0]);
  const ttlMs = Number(result[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error('rate limit script returned non-numeric values');
  }
  return { count, ttlMs };
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly log = new Logger(RateLimitService.name);
  /** Per-process counter. Non-authoritative: N API instances means N separate limits. */
  private readonly memory = new Map<string, Bucket>();
  private redis: Redis | null = null;
  private circuit: Circuit = 'closed';
  private redisDownUntil = 0;
  private backoffMs = REDIS_BACKOFF_MS;
  private warnedUnconfigured = false;

  /**
   * Background Redis errors must not move the deadline. If they did, a reconnect
   * loop would keep the circuit open and the next request would never probe.
   */
  private onRedisError(reason: string): void {
    if (this.circuit === 'open') return;
    this.failRedis(reason);
  }

  private failRedis(reason: string): void {
    const now = Date.now();
    if (this.circuit === 'open' && now < this.redisDownUntil) return;
    const wait = this.backoffMs;
    this.circuit = 'open';
    this.redisDownUntil = now + wait;
    this.backoffMs = Math.min(wait * 2, REDIS_BACKOFF_MAX_MS);
    this.log.error(
      `DEGRADED: Redis rate limiter failed (${reason}). In-memory fallback is non-authoritative (per-process, not a shared limit). Retrying Redis in ${wait}ms.`,
    );
  }

  private recoverRedis(): void {
    if (this.circuit === 'closed' && this.backoffMs === REDIS_BACKOFF_MS) return;
    const wasOpen = this.circuit === 'open';
    this.circuit = 'closed';
    this.redisDownUntil = 0;
    this.backoffMs = REDIS_BACKOFF_MS;
    if (wasOpen) {
      this.log.warn('Redis rate limiter recovered. Shared limits are authoritative again.');
    }
  }

  private warnUnconfigured(): void {
    if (this.warnedUnconfigured) return;
    this.warnedUnconfigured = true;
    this.log.warn(
      'DEGRADED: REDIS_URL is unset. In-memory rate limiting is non-authoritative (per-process only) and is for local dev.',
    );
  }

  private redisClient(): Redis | null {
    if (this.circuit === 'open' && Date.now() < this.redisDownUntil) return null;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!this.redis) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.on('error', (err: Error) => {
        this.onRedisError(err instanceof Error ? err.message : String(err));
      });
    }
    return this.redis;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redis = this.redisClient();
    if (redis) {
      try {
        if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
        const windowMs = Math.max(1, Math.round(windowSeconds * 1000));
        const { count, ttlMs } = readEval(
          await redis.eval(RATE_LIMIT_LUA, 1, key, String(windowMs)),
        );
        this.recoverRedis();
        if (count > limit) throw rateLimited(ttlMs > 0 ? ttlMs : windowMs);
        return;
      } catch (err) {
        if (err instanceof TesseraHttpError) throw err;
        this.failRedis(err instanceof Error ? err.message : 'unknown error');
      }
    } else if (!process.env.REDIS_URL) {
      this.warnUnconfigured();
    }

    this.consumeMemory(key, limit, windowSeconds);
  }

  private consumeMemory(key: string, limit: number, windowSeconds: number): void {
    const now = Date.now();
    const current = this.memory.get(key);
    if (!current || current.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > limit) throw rateLimited(current.resetAt - now);
  }

  onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    return Promise.resolve();
  }
}

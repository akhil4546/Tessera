import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { TesseraHttpError } from './http-error.js';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly log = new Logger(RateLimitService.name);
  private readonly memory = new Map<string, Bucket>();
  private redis: Redis | null = null;
  private redisDisabled = false;

  private getRedis(): Redis | null {
    if (this.redisDisabled) return null;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!this.redis) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.on('error', (err) => {
        this.log.warn(`SOFT-FAIL: Redis rate limiter error (${err.message}). Using in-memory fallback.`);
        this.redisDisabled = true;
      });
    }
    return this.redis;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redis = this.getRedis();
    if (redis) {
      try {
        if (redis.status === 'wait') await redis.connect();
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, windowSeconds);
        if (n > limit) {
          throw new TesseraHttpError(429, 'RATE_LIMIT', 'Too many attempts. Try again later.');
        }
        return;
      } catch (err) {
        if (err instanceof TesseraHttpError) throw err;
        this.log.warn('SOFT-FAIL: Redis rate limiter unavailable. Using in-memory fallback.');
        this.redisDisabled = true;
      }
    }

    const now = Date.now();
    const current = this.memory.get(key);
    if (!current || current.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      throw new TesseraHttpError(429, 'RATE_LIMIT', 'Too many attempts. Try again later.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }
}

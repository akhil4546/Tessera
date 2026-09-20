import { Injectable, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { logger } from './logger.js';

/**
 * SOFT-FAIL: Redis/BullMQ are not required to boot the worker.
 * If Redis is down, we log a labelled warning and stay idle. The API then
 * processes media/fan-out inline (`INLINE_PROCESS`).
 */
@Injectable()
export class RedisProbe implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
    });
    redis.on('error', () => {
      /* labelled soft-fail below; avoid ioredis unhandled error noise */
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      logger.info({ pong }, 'Redis reachable. Media and feed queues start in main.ts.');
      await redis.quit();
    } catch (error) {
      logger.warn(
        { err: error, url },
        'SOFT-FAIL: Redis unavailable. Worker idle until Redis is up. API will INLINE_PROCESS jobs. (not a silent stub)',
      );
      redis.disconnect();
    }
  }
}

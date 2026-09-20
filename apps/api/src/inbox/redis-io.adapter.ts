import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Redis pub/sub so Inbox sockets work across API instances.
 * If Redis is down, Socket.IO stays in-process (labelled SOFT-FAIL).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.warn('SOFT-FAIL: REDIS_URL unset. Inbox sockets are single-process only.');
      return;
    }
    try {
      const pub = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      const sub = pub.duplicate();
      pub.on('error', (err) => {
        this.log.warn(`SOFT-FAIL: Redis socket adapter (${err.message}). Falling back to in-process.`);
      });
      await Promise.all([pub.connect(), sub.connect()]);
      this.adapterConstructor = createAdapter(pub, sub);
    } catch (err) {
      this.log.warn(
        `SOFT-FAIL: Redis socket adapter unavailable (${err instanceof Error ? err.message : 'unknown'}). In-process only.`,
      );
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

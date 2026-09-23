import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import type { InboxSocketEvent } from '@tessera/types';

const PRESENCE_TTL_SECONDS = 45;

@Injectable()
export class InboxRealtime implements OnModuleDestroy {
  private readonly log = new Logger(InboxRealtime.name);
  private server: Server | null = null;
  private redis: Redis | null = null;
  private redisDisabled = false;
  private readonly memory = new Map<string, { handle: string; expiresAt: number }>();

  attach(server: Server): void {
    this.server = server;
  }

  private getRedis(): Redis | null {
    if (this.redisDisabled) return null;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!this.redis) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.on('error', (err) => {
        this.log.warn(
          `SOFT-FAIL: Redis presence error (${err.message}). Using in-memory presence.`,
        );
        this.redisDisabled = true;
      });
    }
    return this.redis;
  }

  async heartbeat(userId: string, handle: string): Promise<void> {
    const redis = this.getRedis();
    if (redis) {
      try {
        if (redis.status === 'wait') await redis.connect();
        await redis.set(`presence:${userId}`, handle, 'EX', PRESENCE_TTL_SECONDS);
        return;
      } catch {
        this.log.warn('SOFT-FAIL: Redis presence unavailable. Using in-memory presence.');
        this.redisDisabled = true;
      }
    }
    this.memory.set(userId, { handle, expiresAt: Date.now() + PRESENCE_TTL_SECONDS * 1000 });
  }

  async isOnline(userId: string): Promise<boolean> {
    const redis = this.getRedis();
    if (redis) {
      try {
        if (redis.status === 'wait') await redis.connect();
        return Boolean(await redis.exists(`presence:${userId}`));
      } catch {
        this.redisDisabled = true;
      }
    }
    const row = this.memory.get(userId);
    if (!row) return false;
    if (row.expiresAt <= Date.now()) {
      this.memory.delete(userId);
      return false;
    }
    return true;
  }

  emitToUser(userId: string, event: InboxSocketEvent): void {
    this.server?.to(`user:${userId}`).emit('inbox', event);
  }

  emitToUsers(userIds: string[], event: InboxSocketEvent, except?: string): void {
    for (const id of userIds) {
      if (id === except) continue;
      this.emitToUser(id, event);
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.redis = null;
  }
}

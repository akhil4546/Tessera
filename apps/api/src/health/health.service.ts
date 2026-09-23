import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { probeMeilisearch } from '@tessera/media';
import type { HealthResponse, ReadinessCheck, ReadinessResponse } from '@tessera/validation';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

const SERVICE = 'tessera-api';
/** A hung dependency must not hold a readiness probe past a 1s caller timeout. */
const CHECK_TIMEOUT_MS = 800;

type CheckStatus = ReadinessCheck['status'];

@Injectable()
export class HealthService implements OnModuleDestroy {
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  getHealth(): HealthResponse {
    return { status: 'ok', service: SERVICE };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [postgres, redis, storage, search] = await Promise.all([
      this.timed(() => this.checkPostgres(), 'down'),
      this.timed(() => this.checkRedis(), 'DEGRADED'),
      this.timed(() => this.checkStorage(), 'down'),
      this.timed(() => this.checkSearch(), 'DEGRADED'),
    ]);
    const checks = { postgres, redis, storage, search };
    return { status: overall(checks), service: SERVICE, checks };
  }

  onModuleDestroy(): void {
    this.dropRedis(this.redis);
  }

  private async checkPostgres(): Promise<CheckStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return 'ok';
  }

  private async checkStorage(): Promise<CheckStatus> {
    await this.storage.probe();
    return 'ok';
  }

  private async checkRedis(): Promise<CheckStatus> {
    const url = process.env.REDIS_URL;
    if (!url) return 'NOT_CONFIGURED';
    const redis = this.redisClient(url);
    try {
      if (redis.status !== 'ready') await redis.connect();
      const pong = await redis.ping();
      return pong === 'PONG' ? 'ok' : 'DEGRADED';
    } catch {
      this.dropRedis(redis);
      return 'DEGRADED';
    }
  }

  private async checkSearch(): Promise<CheckStatus> {
    const result = await probeMeilisearch(CHECK_TIMEOUT_MS);
    if (result === 'ok') return 'ok';
    if (result === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
    return 'DEGRADED';
  }

  private redisClient(url: string): Redis {
    if (this.redis) return this.redis;
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: CHECK_TIMEOUT_MS,
      commandTimeout: CHECK_TIMEOUT_MS,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    // A missing 'error' listener lets a failed connection crash the process.
    redis.on('error', () => undefined);
    this.redis = redis;
    return redis;
  }

  private dropRedis(redis: Redis | null): void {
    if (!redis) return;
    if (this.redis === redis) this.redis = null;
    redis.disconnect();
  }

  private async timed(
    run: () => Promise<CheckStatus>,
    onTimeout: CheckStatus,
  ): Promise<ReadinessCheck> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = run().then(
      (status) => status,
      () => onTimeout,
    );
    try {
      const status = await Promise.race([
        pending,
        new Promise<CheckStatus>((resolve) => {
          timer = setTimeout(() => resolve(onTimeout), CHECK_TIMEOUT_MS);
        }),
      ]);
      return { status, latencyMs: Date.now() - started };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function overall(checks: ReadinessResponse['checks']): ReadinessResponse['status'] {
  if (checks.postgres.status === 'down' || checks.storage.status === 'down') return 'down';
  const values = Object.values(checks);
  if (values.every((check) => check.status === 'ok')) return 'ok';
  return 'degraded';
}

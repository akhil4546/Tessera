import { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { HealthService } from './health.service.js';

const originalRedisUrl = process.env.REDIS_URL;
const originalMeiliHost = process.env.MEILI_HOST;
const originalMeiliKey = process.env.MEILI_API_KEY;

function restoreEnv(name: 'REDIS_URL' | 'MEILI_HOST' | 'MEILI_API_KEY', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function service(opts?: { query?: () => Promise<unknown>; probe?: () => Promise<void> }) {
  const query = vi.fn(opts?.query ?? (async () => [{ ok: 1 }]));
  const probe = vi.fn(opts?.probe ?? (async () => undefined));
  const prisma = { $queryRaw: query } as unknown as PrismaService;
  const storage = { probe } as unknown as StorageService;
  return { health: new HealthService(prisma, storage), query, probe };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreEnv('REDIS_URL', originalRedisUrl);
  restoreEnv('MEILI_HOST', originalMeiliHost);
  restoreEnv('MEILI_API_KEY', originalMeiliKey);
});

describe('HealthService liveness', () => {
  it('is static and does not report a hardcoded phase', () => {
    const { health, query, probe } = service();
    expect(health.getHealth()).toEqual({ status: 'ok', service: 'tessera-api' });
    expect(health.getHealth()).not.toHaveProperty('phase');
    expect(query).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('HealthService readiness', () => {
  it('reports postgres, redis, storage, and search, and is degraded when optional deps are unset', async () => {
    delete process.env.REDIS_URL;
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_API_KEY;
    const connect = vi.spyOn(Redis.prototype, 'connect');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { health, query, probe } = service();

    const body = await health.getReadiness();

    expect(query).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      status: 'degraded',
      service: 'tessera-api',
      checks: {
        postgres: { status: 'ok' },
        redis: { status: 'NOT_CONFIGURED' },
        storage: { status: 'ok' },
        search: { status: 'NOT_CONFIGURED' },
      },
    });
    for (const check of Object.values(body.checks)) {
      expect(check.latencyMs).toBeGreaterThanOrEqual(0);
    }
    await health.onModuleDestroy();
  });

  it('is ok only when every check succeeds', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
    process.env.MEILI_HOST = 'http://127.0.0.1:7700';
    process.env.MEILI_API_KEY = 'meili-test-key';
    vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    vi.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'available' }), { status: 200 })),
    );
    const { health } = service();

    const body = await health.getReadiness();

    expect(body.status).toBe('ok');
    expect(body.checks.postgres.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.storage.status).toBe('ok');
    expect(body.checks.search.status).toBe('ok');
    await health.onModuleDestroy();
  });

  it('is down when postgres or storage fails, and degraded when a configured optional dep fails', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
    process.env.MEILI_HOST = 'http://127.0.0.1:7700';
    process.env.MEILI_API_KEY = 'meili-test-key';
    vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    vi.spyOn(Redis.prototype, 'ping').mockRejectedValue(new Error('connection refused'));
    vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    );
    const { health } = service({
      query: async () => {
        throw new Error('connection refused');
      },
    });

    const down = await health.getReadiness();
    expect(down.status).toBe('down');
    expect(down.checks.postgres.status).toBe('down');
    expect(down.checks.redis.status).toBe('DEGRADED');
    expect(down.checks.storage.status).toBe('ok');
    expect(down.checks.search.status).toBe('DEGRADED');

    const storageDown = await service({
      probe: async () => {
        throw new Error('bucket missing');
      },
    }).health.getReadiness();
    expect(storageDown.status).toBe('down');
    expect(storageDown.checks.postgres.status).toBe('ok');
    expect(storageDown.checks.storage.status).toBe('down');
    await health.onModuleDestroy();
  });

  it('times out each check on its own instead of waiting for the slowest to finish the others', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6399/15';
    process.env.MEILI_HOST = 'http://127.0.0.1:7700';
    process.env.MEILI_API_KEY = 'meili-test-key';
    vi.spyOn(Redis.prototype, 'connect').mockResolvedValue();
    vi.spyOn(Redis.prototype, 'ping').mockImplementation(() => new Promise(() => undefined));
    vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason ?? new Error('aborted'));
          });
        });
      }),
    );
    const { health } = service({
      query: () => new Promise(() => undefined),
      probe: () => new Promise(() => undefined),
    });

    const started = Date.now();
    const body = await health.getReadiness();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(2_500);
    expect(body.status).toBe('down');
    expect(body.checks.postgres.status).toBe('down');
    expect(body.checks.storage.status).toBe('down');
    expect(body.checks.redis.status).toBe('DEGRADED');
    expect(body.checks.search.status).toBe('DEGRADED');
    expect(body.checks.postgres.latencyMs).toBeGreaterThanOrEqual(700);
    await health.onModuleDestroy();
  });
});

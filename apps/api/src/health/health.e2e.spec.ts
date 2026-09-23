import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

const originalRedisUrl = process.env.REDIS_URL;
const originalMeiliHost = process.env.MEILI_HOST;
const originalMeiliKey = process.env.MEILI_API_KEY;

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  const query = vi.fn(async () => [{ ok: 1 }]);
  const probe = vi.fn(async () => undefined);

  beforeAll(async () => {
    delete process.env.REDIS_URL;
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_API_KEY;
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: query } },
        { provide: StorageService, useValue: { probe } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalMeiliHost === undefined) delete process.env.MEILI_HOST;
    else process.env.MEILI_HOST = originalMeiliHost;
    if (originalMeiliKey === undefined) delete process.env.MEILI_API_KEY;
    else process.env.MEILI_API_KEY = originalMeiliKey;
  });

  it('returns liveness without a phase', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'tessera-api' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(query).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it('also serves /v1/health', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'tessera-api' });
  });

  it('reports degraded readiness when optional dependencies are unset', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body).toMatchObject({
      status: 'degraded',
      service: 'tessera-api',
      checks: {
        postgres: { status: 'ok' },
        redis: { status: 'NOT_CONFIGURED' },
        storage: { status: 'ok' },
        search: { status: 'NOT_CONFIGURED' },
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(query).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledOnce();
  });

  it('returns 503 when postgres is down and still lists every check', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    const response = await request(app.getHttpServer()).get('/v1/health/ready').expect(503);
    expect(response.body.status).toBe('down');
    expect(response.body.checks.postgres.status).toBe('down');
    expect(response.body.checks.storage.status).toBe('ok');
    expect(response.body.checks.redis.status).toBe('NOT_CONFIGURED');
    expect(response.body.checks.search.status).toBe('NOT_CONFIGURED');
  });
});

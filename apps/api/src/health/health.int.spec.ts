import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthModule } from './health.module.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('GET /health/ready (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('queries postgres and storage instead of a static payload', async () => {
    const live = await request(app.getHttpServer()).get('/health').expect(200);
    expect(live.body).toEqual({ status: 'ok', service: 'tessera-api' });

    const ready = await request(app.getHttpServer()).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.service).toBe('tessera-api');
    expect(ready.body.checks.postgres.status).toBe('ok');
    expect(ready.body.checks.storage.status).toBe('ok');
    expect(['ok', 'degraded']).toContain(ready.body.status);
    if (!process.env.REDIS_URL) {
      expect(ready.body.checks.redis.status).toBe('NOT_CONFIGURED');
    } else {
      expect(['ok', 'DEGRADED']).toContain(ready.body.checks.redis.status);
    }
    if (!process.env.MEILI_HOST || !process.env.MEILI_API_KEY) {
      expect(ready.body.checks.search.status).toBe('NOT_CONFIGURED');
    } else {
      expect(['ok', 'DEGRADED']).toContain(ready.body.checks.search.status);
    }

    const v1 = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(v1.body.checks.postgres.status).toBe('ok');
    expect(v1.body.checks.storage.status).toBe('ok');
  });
});

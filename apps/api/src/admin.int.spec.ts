import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from './common/crypto.js';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('admin (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const email = `staff.${suffix}@tessera.test`;
  const user = {
    email: `n.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `n_${suffix}`.slice(0, 30),
    displayName: 'Nia',
    dateOfBirth: '1998-05-09',
    client: 'web' as const,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await hashPassword('Adminpass1!'),
        displayName: 'Staff',
        role: 'superadmin',
      },
    });
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: user.email } });
    await app.close();
  });

  it('rejects the public session and authenticates staff separately', async () => {
    const publicAgent = request.agent(app.getHttpServer());
    await publicAgent.post('/v1/auth/register').send(user).expect(201);
    await publicAgent.get('/v1/admin/queue').expect(401);

    const adminAgent = request.agent(app.getHttpServer());
    const login = await adminAgent.post('/v1/admin/auth/login').send({ email, password: 'Adminpass1!' }).expect(201);
    expect(login.body.admin.email).toBe(email);
    expect(login.body.admin.role).toBe('superadmin');

    const me = await adminAgent.get('/v1/admin/me').expect(200);
    expect(me.body.email).toBe(email);

    await adminAgent.post('/v1/admin/keyword-filters').send({ keyword: 'scamz', action: 'queue' }).expect(201);
    const filters = await adminAgent.get('/v1/admin/keyword-filters').expect(200);
    expect(filters.body.items.some((row: { keyword: string }) => row.keyword === 'scamz')).toBe(true);

    const found = await adminAgent.get(`/v1/admin/users?q=${user.handle}`).expect(200);
    expect(found.body.items.some((row: { handle: string }) => row.handle === user.handle)).toBe(true);
    const id = found.body.items.find((row: { handle: string }) => row.handle === user.handle).id;

    await adminAgent.post(`/v1/admin/users/${id}/suspend`).send({ reason: 'Test hold', days: 1 }).expect(201);
    await publicAgent.get('/v1/me').expect(403);

    const audit = await adminAgent.get('/v1/admin/audit').expect(200);
    expect(audit.body.items.some((row: { action: string }) => row.action === 'user.suspend')).toBe(true);
  });
});

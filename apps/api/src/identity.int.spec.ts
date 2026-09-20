import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('identity & graph (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const asha = {
    email: `asha.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_${suffix}`.slice(0, 30),
    displayName: 'Asha',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const june = {
    email: `june.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `june_${suffix}`.slice(0, 30),
    displayName: 'June',
    dateOfBirth: '1996-07-02',
    client: 'web' as const,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [asha.email, june.email] } },
    });
    await app.close();
  });

  it('registers, follows a private account as a request, then blocks', async () => {
    const ashaAgent = request.agent(app.getHttpServer());
    const juneAgent = request.agent(app.getHttpServer());

    await ashaAgent.post('/v1/auth/register').send(asha).expect(201);
    const juneRes = await juneAgent.post('/v1/auth/register').send(june).expect(201);
    expect(juneRes.body.user.handle).toBe(june.handle);

    await juneAgent.patch('/v1/me/privacy').send({ isPrivate: true }).expect(200);

    const follow = await ashaAgent.post(`/v1/users/${june.handle}/follow`).expect(201);
    expect(follow.body.viewer.followStatus).toBe('pending');

    const requests = await juneAgent.get('/v1/me/follow-requests').expect(200);
    expect(requests.body.items.some((row: { handle: string }) => row.handle === asha.handle)).toBe(true);

    await juneAgent.post(`/v1/users/${asha.handle}/follow/accept`).expect(201);

    const accepted = await ashaAgent.get(`/v1/users/${june.handle}`).expect(200);
    expect(accepted.body.viewer.following).toBe(true);

    const blocked = await ashaAgent.post(`/v1/users/${june.handle}/block`).expect(201);
    expect(blocked.body.viewer.blockedByMe).toBe(true);

    await ashaAgent.get(`/v1/users/${june.handle}`).expect(404);
  });
});

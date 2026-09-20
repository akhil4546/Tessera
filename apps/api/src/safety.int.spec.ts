import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('safety (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const asha = {
    email: `asha.s${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_s_${suffix}`.slice(0, 30),
    displayName: 'Asha',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const piotr = {
    email: `piotr.s${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `piotr_s_${suffix}`.slice(0, 30),
    displayName: 'Piotr',
    dateOfBirth: '1987-08-21',
    client: 'web' as const,
  };
  const iris = {
    email: `iris.s${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `iris_s_${suffix}`.slice(0, 30),
    displayName: 'Iris',
    dateOfBirth: '2010-04-12',
    client: 'web' as const,
  };
  const bea = {
    email: `bea.s${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `bea_s_${suffix}`.slice(0, 30),
    displayName: 'Bea',
    dateOfBirth: '1992-06-16',
    client: 'web' as const,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [asha.email, piotr.email, iris.email, bea.email] } },
    });
    await app.close();
  });

  it('reports, restrict comments, minors stay out of people search, export and deletion work', async () => {
    const ashaAgent = request.agent(app.getHttpServer());
    const piotrAgent = request.agent(app.getHttpServer());
    const irisAgent = request.agent(app.getHttpServer());
    const beaAgent = request.agent(app.getHttpServer());

    const ashaRes = await ashaAgent.post('/v1/auth/register').send(asha).expect(201);
    await piotrAgent.post('/v1/auth/register').send(piotr).expect(201);
    const irisRes = await irisAgent.post('/v1/auth/register').send(iris).expect(201);
    await beaAgent.post('/v1/auth/register').send(bea).expect(201);
    expect(irisRes.body.user.isMinor).toBe(true);
    expect(irisRes.body.user.isPrivate).toBe(true);
    expect(irisRes.body.user.whoCanMessage).toBe('followers');

    const people = await ashaAgent.get(`/v1/search?q=${iris.handle}&tab=people`).expect(200);
    const peopleHits = people.body.people ?? people.body.items ?? [];
    expect(peopleHits.some((row: { handle?: string }) => row.handle === iris.handle)).toBe(false);

    await ashaAgent.post(`/v1/users/${piotr.handle}/restrict`).expect(201);
    const restricted = await ashaAgent.get('/v1/me/restricted').expect(200);
    expect(restricted.body.items.some((row: { handle: string }) => row.handle === piotr.handle)).toBe(true);

    const post = await prisma.post.create({
      data: {
        authorId: ashaRes.body.user.id,
        kind: 'post',
        visibility: 'public',
        caption: 'A public tile',
        authenticity: 'unfiltered',
        publishedAt: new Date(),
      },
    });

    const hidden = await piotrAgent.post(`/v1/posts/${post.id}/comments`).send({ body: 'from restricted' }).expect(201);
    const ashaSees = await ashaAgent.get(`/v1/posts/${post.id}/comments`).expect(200);
    const ashaComment = ashaSees.body.items.find(
      (row: { author: { handle: string } }) => row.author.handle === piotr.handle,
    );
    expect(ashaComment.hiddenByRestrict).toBe(true);
    expect(ashaComment.body).toBe('from restricted');

    const strangerSees = await beaAgent.get(`/v1/posts/${post.id}/comments`).expect(200);
    const hiddenRow = strangerSees.body.items.find(
      (row: { author: { handle: string } }) => row.author.handle === piotr.handle,
    );
    expect(hiddenRow.hidden).toBe(true);
    expect(hiddenRow.body).toBe('');

    await ashaAgent.post(`/v1/comments/${hidden.body.id}/approve`).expect(201);
    const after = await beaAgent.get(`/v1/posts/${post.id}/comments`).expect(200);
    const shown = after.body.items.find((row: { id: string }) => row.id === hidden.body.id);
    expect(shown.hidden).toBe(false);

    const report = await piotrAgent.post(`/v1/posts/${post.id}/report`).send({ reason: 'spam' }).expect(201);
    expect(report.body.reason).toBe('spam');
    expect(report.body.caseId).toBeTruthy();

    await ashaAgent.put('/v1/me/sensitivity').send({ sensitivityLevel: 'hide' }).expect(200);

    const exportJob = await ashaAgent.post('/v1/me/export').expect(201);
    expect(['pending', 'running', 'ready'].includes(exportJob.body.status)).toBe(true);

    const deletion = await ashaAgent.post('/v1/me/delete').send({ password: asha.password }).expect(201);
    expect(deletion.body.status).toBe('pending');
    expect(new Date(deletion.body.executeAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });
});

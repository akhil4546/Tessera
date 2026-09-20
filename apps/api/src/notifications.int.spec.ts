import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('notifications (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const asha = {
    email: `asha.n${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_n${suffix}`.slice(0, 30),
    displayName: 'Asha N',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const ravi = {
    email: `ravi.n${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ravi_n${suffix}`.slice(0, 30),
    displayName: 'Ravi N',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const nia = {
    email: `nia.n${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `nia_n${suffix}`.slice(0, 30),
    displayName: 'Nia N',
    dateOfBirth: '1998-05-09',
    client: 'web' as const,
  };
  const june = {
    email: `june.n${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `june_n${suffix}`.slice(0, 30),
    displayName: 'June N',
    dateOfBirth: '1996-07-22',
    client: 'web' as const,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(cookieParser());
    app.use(json({ limit: '2mb' }));
    app.use('/v1/media', (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'POST' && req.path.endsWith('/bytes')) {
        raw({ type: '*/*', limit: '5mb' })(req, res, next);
        return;
      }
      next();
    });
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [asha.email, ravi.email, nia.email, june.email] } },
    });
    await app.close();
  });

  it('aggregates appreciations and powers the unified Inbox filters', async () => {
    const ashaAgent = request.agent(app.getHttpServer());
    const raviAgent = request.agent(app.getHttpServer());
    const niaAgent = request.agent(app.getHttpServer());
    const juneAgent = request.agent(app.getHttpServer());
    await ashaAgent.post('/v1/auth/register').send(asha).expect(201);
    await raviAgent.post('/v1/auth/register').send(ravi).expect(201);
    await niaAgent.post('/v1/auth/register').send(nia).expect(201);
    await juneAgent.post('/v1/auth/register').send(june).expect(201);
    await juneAgent.patch('/v1/me/privacy').send({ isPrivate: true }).expect(200);

    const jpeg = await sharp({
      create: { width: 64, height: 80, channels: 3, background: { r: 200, g: 85, b: 61 } },
    })
      .jpeg()
      .toBuffer();
    const intent = await ashaAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
      .expect(201);
    await ashaAgent.post(`/v1/media/${intent.body.id}/bytes`).set('Content-Type', 'image/jpeg').send(jpeg).expect(201);
    await ashaAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
    const post = await ashaAgent
      .post('/v1/posts')
      .send({
        media: [{ id: intent.body.id, altText: 'Granite tile', filterId: 'none' }],
        caption: `Hello @${nia.handle} from granite.`,
        authenticity: 'unfiltered',
        visibility: 'public',
      })
      .expect(201);

    const mentionInbox = await niaAgent.get('/v1/inbox?filter=mentions').expect(200);
    expect(
      mentionInbox.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'mention',
      ),
    ).toBe(true);

    await raviAgent.post(`/v1/posts/${post.body.id}/appreciations`).send({ type: 'love' }).expect(201);
    await niaAgent.post(`/v1/posts/${post.body.id}/appreciations`).send({ type: 'inspiring' }).expect(201);
    const appreciated = await ashaAgent.get('/v1/inbox?filter=appreciations').expect(200);
    const appreciation = appreciated.body.items.find(
      (row: { type: string; notification?: { kind: string; actorCount: number; body: string } }) =>
        row.type === 'activity' && row.notification?.kind === 'appreciation',
    );
    expect(appreciation.notification.actorCount).toBe(2);
    expect(appreciation.notification.body).toMatch(/and/);

    await niaAgent.post(`/v1/posts/${post.body.id}/comments`).send({ body: `Nice light @${ravi.handle}` }).expect(201);
    const comments = await ashaAgent.get('/v1/inbox?filter=all').expect(200);
    expect(
      comments.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'comment',
      ),
    ).toBe(true);
    const raviMention = await raviAgent.get('/v1/inbox?filter=mentions').expect(200);
    expect(
      raviMention.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'mention',
      ),
    ).toBe(true);

    await raviAgent.post(`/v1/users/${asha.handle}/follow`).expect(201);
    const follows = await ashaAgent.get('/v1/inbox?filter=follows').expect(200);
    expect(
      follows.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'new_follower',
      ),
    ).toBe(true);

    await niaAgent.post(`/v1/users/${june.handle}/follow`).expect(201);
    const juneRequests = await juneAgent.get('/v1/inbox?filter=follows').expect(200);
    expect(
      juneRequests.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'follow_request',
      ),
    ).toBe(true);

    await ashaAgent
      .put('/v1/me/notification-preferences')
      .send({ channels: { appreciation: { inApp: false, push: false, email: false } } })
      .expect(200);
    const hidden = await ashaAgent.get('/v1/inbox?filter=appreciations').expect(200);
    expect(
      hidden.body.items.some(
        (row: { type: string; notification?: { kind: string } }) =>
          row.type === 'activity' && row.notification?.kind === 'appreciation',
      ),
    ).toBe(false);

    const beforeRead = await ashaAgent.get('/v1/inbox/badge').expect(200);
    expect(beforeRead.body.unreadActivity).toBeGreaterThan(0);
    await ashaAgent.post('/v1/notifications/read').send({ all: true }).expect(201);
    const afterRead = await ashaAgent.get('/v1/inbox/badge').expect(200);
    expect(afterRead.body.unreadActivity).toBe(0);

    const vapid = await ashaAgent.get('/v1/me/push/vapid').expect(200);
    expect(vapid.body).toHaveProperty('configured');
    const device = await ashaAgent
      .post('/v1/me/devices')
      .send({ platform: 'expo', token: `ExponentPushToken[test-${suffix}]` })
      .expect(201);
    expect(device.body.platform).toBe('expo');
  });
});

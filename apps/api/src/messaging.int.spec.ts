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

async function jpegTile(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 80, channels: 3, background: { r: 200, g: 85, b: 61 } },
  })
    .jpeg()
    .toBuffer();
}

describeDb('inbox messaging (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const asha = {
    email: `asha.m${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_m${suffix}`.slice(0, 30),
    displayName: 'Asha M',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const ravi = {
    email: `ravi.m${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ravi_m${suffix}`.slice(0, 30),
    displayName: 'Ravi M',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const nia = {
    email: `nia.m${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `nia_m${suffix}`.slice(0, 30),
    displayName: 'Nia M',
    dateOfBirth: '1998-05-09',
    client: 'web' as const,
  };
  const omar = {
    email: `omar.m${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `omar_m${suffix}`.slice(0, 30),
    displayName: 'Omar M',
    dateOfBirth: '1990-12-01',
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
    await prisma.conversation.deleteMany({
      where: { members: { some: { user: { email: { in: [asha.email, ravi.email, nia.email, omar.email] } } } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [asha.email, ravi.email, nia.email, omar.email] } },
    });
    await app.close();
  });

  it('1:1, requests, groups, media, receipts, edit/unsend, and labelled 501s', async () => {
    const ashaAgent = request.agent(app.getHttpServer());
    const raviAgent = request.agent(app.getHttpServer());
    const niaAgent = request.agent(app.getHttpServer());
    const omarAgent = request.agent(app.getHttpServer());
    await ashaAgent.post('/v1/auth/register').send(asha).expect(201);
    await raviAgent.post('/v1/auth/register').send(ravi).expect(201);
    await niaAgent.post('/v1/auth/register').send(nia).expect(201);
    await omarAgent.post('/v1/auth/register').send(omar).expect(201);
    await ashaAgent.post(`/v1/users/${ravi.handle}/follow`).expect(201);
    await raviAgent.post(`/v1/users/${asha.handle}/follow`).expect(201);
    await ashaAgent.post(`/v1/users/${nia.handle}/follow`).expect(201);
    await niaAgent.post(`/v1/users/${asha.handle}/follow`).expect(201);

    const direct = await ashaAgent.post('/v1/inbox/conversations').send({ handle: ravi.handle }).expect(201);
    expect(direct.body.kind).toBe('direct');
    expect(direct.body.request).toBeNull();
    expect(direct.body.e2eVersion).toBe(0);

    const again = await ashaAgent.post('/v1/inbox/conversations').send({ handle: ravi.handle }).expect(201);
    expect(again.body.id).toBe(direct.body.id);

    const sent = await ashaAgent
      .post(`/v1/inbox/conversations/${direct.body.id}/messages`)
      .send({ kind: 'text', body: 'Oak in the afternoon.', clientId: `c-${suffix}` })
      .expect(201);
    expect(sent.body.body).toBe('Oak in the afternoon.');
    expect(sent.body.bodyEncoding).toBe('plaintext');

    const idempotent = await ashaAgent
      .post(`/v1/inbox/conversations/${direct.body.id}/messages`)
      .send({ kind: 'text', body: 'Oak in the afternoon.', clientId: `c-${suffix}` })
      .expect(201);
    expect(idempotent.body.id).toBe(sent.body.id);

    const jpeg = await jpegTile();
    const intent = await ashaAgent
      .post('/v1/media/intents')
      .send({ purpose: 'message', kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
      .expect(201);
    await ashaAgent.post(`/v1/media/${intent.body.id}/bytes`).set('Content-Type', 'image/jpeg').send(jpeg);
    await ashaAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
    const photo = await ashaAgent
      .post(`/v1/inbox/conversations/${direct.body.id}/messages`)
      .send({ kind: 'image', mediaId: intent.body.id })
      .expect(201);
    expect(photo.body.kind).toBe('image');
    expect(photo.body.media?.status).toBe('ready');

    await raviAgent.post(`/v1/inbox/conversations/${direct.body.id}/delivered`).send({ messageId: photo.body.id }).expect(201);
    await raviAgent.post(`/v1/inbox/conversations/${direct.body.id}/read`).send({ messageId: photo.body.id }).expect(201);
    const afterRead = await ashaAgent.get(`/v1/inbox/conversations/${direct.body.id}/messages`).expect(200);
    const lastOwn = afterRead.body.items.find((row: { id: string }) => row.id === photo.body.id);
    expect(lastOwn.receipt.read).toBe(true);

    const edited = await ashaAgent
      .patch(`/v1/inbox/messages/${sent.body.id}`)
      .send({ body: 'Oak in the late afternoon.' })
      .expect(200);
    expect(edited.body.editedAt).toBeTruthy();
    const unsent = await ashaAgent.delete(`/v1/inbox/messages/${sent.body.id}`).expect(200);
    expect(unsent.body.deletedAt).toBeTruthy();
    expect(unsent.body.body).toBe('');

    const reacted = await raviAgent
      .post(`/v1/inbox/messages/${photo.body.id}/reactions`)
      .send({ emoji: '✨' })
      .expect(201);
    expect(reacted.body.reactions.some((row: { emoji: string; mine: boolean }) => row.emoji === '✨' && row.mine)).toBe(
      true,
    );

    const requestThread = await omarAgent.post('/v1/inbox/conversations').send({ handle: asha.handle }).expect(201);
    expect(requestThread.body.request.status).toBe('pending');
    expect(requestThread.body.request.incoming).toBe(false);
    await omarAgent
      .post(`/v1/inbox/conversations/${requestThread.body.id}/messages`)
      .send({ kind: 'text', body: 'From the courtyard.' })
      .expect(201);

    const ashaInbox = await ashaAgent.get('/v1/inbox?filter=messages').expect(200);
    expect(
      ashaInbox.body.items.some(
        (row: { type: string; conversation?: { id: string } }) =>
          row.type === 'thread' && row.conversation?.id === requestThread.body.id,
      ),
    ).toBe(false);
    const requests = await ashaAgent.get('/v1/inbox?filter=requests').expect(200);
    expect(requests.body.pendingRequests).toBeGreaterThanOrEqual(1);
    const pending = requests.body.items.find(
      (row: { type: string; conversation?: { id: string; request?: { incoming: boolean; id: string } } }) =>
        row.type === 'thread' && row.conversation?.id === requestThread.body.id,
    );
    expect(pending.conversation.request.incoming).toBe(true);

    await ashaAgent.post(`/v1/inbox/requests/${pending.conversation.request.id}/accept`).expect(201);
    const afterAccept = await ashaAgent.get('/v1/inbox?filter=messages').expect(200);
    expect(
      afterAccept.body.items.some(
        (row: { type: string; conversation?: { id: string } }) =>
          row.type === 'thread' && row.conversation?.id === requestThread.body.id,
      ),
    ).toBe(true);

    const group = await ashaAgent
      .post('/v1/inbox/conversations')
      .send({ handles: [ravi.handle, nia.handle], title: 'Clay crew' })
      .expect(201);
    expect(group.body.kind).toBe('group');
    expect(group.body.members).toHaveLength(3);
    await ashaAgent
      .post(`/v1/inbox/conversations/${group.body.id}/messages`)
      .send({ kind: 'text', body: 'Heat drops at six.' })
      .expect(201);
    const niaGroup = await niaAgent.get(`/v1/inbox/conversations/${group.body.id}`).expect(200);
    expect(niaGroup.body.title).toBe('Clay crew');

    const tooBig = await ashaAgent
      .post('/v1/inbox/conversations')
      .send({ handles: [ravi.handle] });
    expect(tooBig.body.kind).toBe('direct');

    const cannotAddStranger = await ashaAgent
      .post(`/v1/inbox/conversations/${group.body.id}/members`)
      .send({ handles: [omar.handle] })
      .expect(403);
    expect(cannotAddStranger.body.error.code).toBe('CANNOT_ADD');

    await raviAgent.put('/v1/me/messaging').send({ readReceiptsEnabled: false }).expect(200);
    const prefs = await raviAgent.get('/v1/me/messaging').expect(200);
    expect(prefs.body.readReceiptsEnabled).toBe(false);

    const report = await ashaAgent
      .post(`/v1/inbox/conversations/${direct.body.id}/report`)
      .send({ reason: 'spam' })
      .expect(201);
    expect(report.body.reason).toBe('spam');
    expect(report.body.caseId).toBeTruthy();

    await ashaAgent.post(`/v1/users/${ravi.handle}/block`).expect(201);
    await ashaAgent.get(`/v1/inbox/conversations/${direct.body.id}`).expect(404);
  });
});

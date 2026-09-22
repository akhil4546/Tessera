import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_PENDING_TTL_MS,
  IDEMPOTENCY_TTL_MS,
  purgeIdempotencyRecords,
} from '@tessera/media';
import { AppModule } from './app.module.js';
import { hashIdempotencyBody } from './common/idempotency.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('idempotency on create routes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const owner = {
    email: `idem.owner.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `idem_o_${suffix}`.slice(0, 30),
    displayName: 'Idem Owner',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const peer = {
    email: `idem.peer.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `idem_p_${suffix}`.slice(0, 30),
    displayName: 'Idem Peer',
    dateOfBirth: '1994-03-12',
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
      where: { members: { some: { user: { email: { in: [owner.email, peer.email] } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [owner.email, peer.email] } } });
    await app.close();
  });

  it('replays circles, boards, messages, comments, and deletes for the same key', async () => {
    const ownerAgent = request.agent(app.getHttpServer());
    const peerAgent = request.agent(app.getHttpServer());
    await ownerAgent.post('/v1/auth/register').send(owner).expect(201);
    await peerAgent.post('/v1/auth/register').send(peer).expect(201);
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });

    await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', 'k'.repeat(256))
      .send({ name: 'Too long' })
      .expect(400);

    const circleKey = `circle-${suffix}`;
    const circle = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', circleKey)
      .send({ name: 'Close' })
      .expect(201);
    const circleAgain = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', circleKey)
      .send({ name: 'Close' })
      .expect(201);
    expect(circleAgain.body).toEqual(circle.body);
    expect(await prisma.circle.count({ where: { ownerId: ownerRow.id, name: 'Close' } })).toBe(1);
    expect(
      await prisma.idempotencyRecord.count({ where: { userId: ownerRow.id, key: circleKey } }),
    ).toBe(1);
    const storedCircle = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { userId: ownerRow.id, key: circleKey, route: { contains: '/me/circles' } },
    });
    expect(storedCircle.route.startsWith('POST ')).toBe(true);
    expect(storedCircle.status).toBe(201);

    const busyKey = `busy-${suffix}`;
    await prisma.idempotencyRecord.create({
      data: {
        userId: ownerRow.id,
        key: busyKey,
        route: storedCircle.route,
        status: 0,
        body: { v: 1, hash: hashIdempotencyBody({ name: 'Busy' }), response: null },
      },
    });
    const busy = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', busyKey)
      .send({ name: 'Busy' })
      .expect(409);
    expect(busy.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    expect(await prisma.circle.count({ where: { ownerId: ownerRow.id, name: 'Busy' } })).toBe(0);

    await prisma.idempotencyRecord.create({
      data: {
        userId: ownerRow.id,
        key: `old-lock-${suffix}`,
        route: storedCircle.route,
        status: 0,
        body: { v: 1, hash: hashIdempotencyBody({ name: 'Reclaimed' }), response: null },
        createdAt: new Date(Date.now() - IDEMPOTENCY_PENDING_TTL_MS - 1000),
      },
    });
    const reclaimedOk = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', `old-lock-${suffix}`)
      .send({ name: 'Reclaimed' })
      .expect(201);
    expect(reclaimedOk.body.name).toBe('Reclaimed');
    expect(await prisma.circle.count({ where: { ownerId: ownerRow.id, name: 'Reclaimed' } })).toBe(
      1,
    );

    await prisma.idempotencyRecord.create({
      data: {
        userId: ownerRow.id,
        key: `legacy-${suffix}`,
        route: storedCircle.route,
        status: 201,
        body: 'legacy-post-id',
      },
    });
    const legacy = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', `legacy-${suffix}`)
      .send({ name: 'Legacy' })
      .expect(409);
    expect(legacy.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await prisma.circle.count({ where: { ownerId: ownerRow.id, name: 'Legacy' } })).toBe(0);

    const mismatch = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', circleKey)
      .send({ name: 'Other' })
      .expect(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
    expect(await prisma.circle.count({ where: { ownerId: ownerRow.id, name: 'Other' } })).toBe(0);

    const retryKey = `circle-retry-${suffix}`;
    await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', retryKey)
      .send({ name: '' })
      .expect(400);
    const retried = await ownerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', retryKey)
      .send({ name: 'After a validation error' })
      .expect(201);
    expect(retried.body.name).toBe('After a validation error');

    const peerCircle = await peerAgent
      .post('/v1/me/circles')
      .set('Idempotency-Key', circleKey)
      .send({ name: 'Close' })
      .expect(201);
    expect(peerCircle.body.id).not.toBe(circle.body.id);

    const board = await ownerAgent
      .post('/v1/boards')
      .set('Idempotency-Key', circleKey)
      .send({ title: 'North light' })
      .expect(201);
    expect(board.body.id).not.toBe(circle.body.id);
    const boardAgain = await ownerAgent
      .post('/v1/boards')
      .set('Idempotency-Key', circleKey)
      .send({ title: 'North light' })
      .expect(201);
    expect(boardAgain.body.id).toBe(board.body.id);
    expect(
      await prisma.board.count({ where: { ownerId: ownerRow.id, title: 'North light' } }),
    ).toBe(1);

    await ownerAgent.post(`/v1/users/${peer.handle}/follow`).expect(201);
    await peerAgent.post(`/v1/users/${owner.handle}/follow`).expect(201);
    const conversation = await ownerAgent
      .post('/v1/inbox/conversations')
      .send({ handle: peer.handle })
      .expect(201);
    const messageKey = `msg-${suffix}`;
    const message = await ownerAgent
      .post(`/v1/inbox/conversations/${conversation.body.id}/messages`)
      .set('Idempotency-Key', messageKey)
      .send({ kind: 'text', body: 'Sent once.' })
      .expect(201);
    const messageAgain = await ownerAgent
      .post(`/v1/inbox/conversations/${conversation.body.id}/messages`)
      .set('Idempotency-Key', messageKey)
      .send({ kind: 'text', body: 'Sent once.' })
      .expect(201);
    expect(messageAgain.body.id).toBe(message.body.id);
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.body.id, body: 'Sent once.' },
      }),
    ).toBe(1);

    const jpeg = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 20, g: 40, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const intent = await ownerAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
      .expect(201);
    await ownerAgent
      .post(`/v1/media/${intent.body.id}/bytes`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(201);
    await ownerAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
    const postKey = `post-${suffix}`;
    const post = await ownerAgent
      .post('/v1/posts')
      .set('Idempotency-Key', postKey)
      .send({
        media: [{ id: intent.body.id, altText: 'A small tile', filterId: 'none' }],
        caption: 'Once',
        authenticity: 'unfiltered',
        visibility: 'public',
      })
      .expect(201);
    const postAgain = await ownerAgent
      .post('/v1/posts')
      .set('Idempotency-Key', postKey)
      .send({
        media: [{ id: intent.body.id, altText: 'A small tile', filterId: 'none' }],
        caption: 'Once',
        authenticity: 'unfiltered',
        visibility: 'public',
      })
      .expect(201);
    expect(postAgain.body.id).toBe(post.body.id);
    expect(await prisma.post.count({ where: { authorId: ownerRow.id, caption: 'Once' } })).toBe(1);

    const commentKey = `comment-${suffix}`;
    const comment = await ownerAgent
      .post(`/v1/posts/${post.body.id}/comments`)
      .set('Idempotency-Key', commentKey)
      .send({ body: 'One comment.' })
      .expect(201);
    const commentAgain = await ownerAgent
      .post(`/v1/posts/${post.body.id}/comments`)
      .set('Idempotency-Key', commentKey)
      .send({ body: 'One comment.' })
      .expect(201);
    expect(commentAgain.body.id).toBe(comment.body.id);
    expect(
      await prisma.comment.count({ where: { postId: post.body.id, body: 'One comment.' } }),
    ).toBe(1);

    const loved = await ownerAgent
      .post(`/v1/posts/${post.body.id}/appreciations`)
      .set('Idempotency-Key', `love-${suffix}`)
      .send({ type: 'love' })
      .expect(201);
    const lovedAgain = await ownerAgent
      .post(`/v1/posts/${post.body.id}/appreciations`)
      .set('Idempotency-Key', `love-${suffix}`)
      .send({ type: 'love' })
      .expect(201);
    expect(lovedAgain.body.id).toBe(loved.body.id);
    expect(
      await prisma.appreciation.count({ where: { postId: post.body.id, userId: ownerRow.id } }),
    ).toBe(1);

    const report = await ownerAgent
      .post(`/v1/users/${peer.handle}/report`)
      .set('Idempotency-Key', `report-${suffix}`)
      .send({ reason: 'spam' })
      .expect(201);
    const reportAgain = await ownerAgent
      .post(`/v1/users/${peer.handle}/report`)
      .set('Idempotency-Key', `report-${suffix}`)
      .send({ reason: 'spam' })
      .expect(201);
    expect(reportAgain.body.id).toBe(report.body.id);
    expect(await prisma.report.count({ where: { reporterId: ownerRow.id } })).toBe(1);

    await ownerAgent.get('/v1/me/circles').set('Idempotency-Key', `get-${suffix}`).expect(200);
    expect(
      await prisma.idempotencyRecord.count({
        where: { userId: ownerRow.id, route: { startsWith: 'GET ' } },
      }),
    ).toBe(0);

    const removed = await ownerAgent
      .delete(`/v1/me/circles/${retried.body.id}`)
      .set('Idempotency-Key', `del-${suffix}`)
      .expect(200);
    const removedAgain = await ownerAgent
      .delete(`/v1/me/circles/${retried.body.id}`)
      .set('Idempotency-Key', `del-${suffix}`)
      .expect(200);
    expect(removedAgain.body).toEqual(removed.body);

    await prisma.idempotencyRecord.update({
      where: { id: storedCircle.id },
      data: { createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000) },
    });
    const stuck = await prisma.idempotencyRecord.create({
      data: {
        userId: ownerRow.id,
        key: `stuck-${suffix}`,
        route: storedCircle.route,
        status: 0,
        body: { v: 1, hash: 'abandoned', response: null },
        createdAt: new Date(Date.now() - IDEMPOTENCY_PENDING_TTL_MS - 1000),
      },
    });
    const postRecord = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { userId: ownerRow.id, key: postKey },
    });
    const purged = await purgeIdempotencyRecords(prisma, new Date());
    expect(purged.deleted).toBeGreaterThanOrEqual(2);
    expect(
      await prisma.idempotencyRecord.findUnique({ where: { id: storedCircle.id } }),
    ).toBeNull();
    expect(await prisma.idempotencyRecord.findUnique({ where: { id: stuck.id } })).toBeNull();
    expect(
      await prisma.idempotencyRecord.findUnique({ where: { id: postRecord.id } }),
    ).not.toBeNull();
  }, 60_000);
});

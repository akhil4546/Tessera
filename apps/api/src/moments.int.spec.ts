import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expireMoments } from '@tessera/media';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';
import { StorageService } from './storage/storage.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('moments & reel shelves (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  const suffix = `${Date.now()}`;
  const author = {
    email: `mara.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `mara_${suffix}`.slice(0, 30),
    displayName: 'Mara',
    dateOfBirth: '1993-02-14',
    client: 'web' as const,
  };
  const viewer = {
    email: `asha.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_${suffix}`.slice(0, 30),
    displayName: 'Asha',
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
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [author.email, viewer.email] } } });
    await app.close();
  });

  it('create → tray → view → react → keep → expire', async () => {
    const authorAgent = request.agent(app.getHttpServer());
    const viewerAgent = request.agent(app.getHttpServer());
    await authorAgent.post('/v1/auth/register').send(author).expect(201);
    await viewerAgent.post('/v1/auth/register').send(viewer).expect(201);

    const jpeg = await sharp({
      create: { width: 64, height: 80, channels: 3, background: { r: 91, g: 117, b: 83 } },
    })
      .jpeg()
      .toBuffer();

    const intent = await authorAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length, purpose: 'moment' })
      .expect(201);

    await authorAgent
      .post(`/v1/media/${intent.body.id}/bytes`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(201);
    await authorAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);

    const created = await authorAgent
      .post('/v1/moments')
      .set('Idempotency-Key', `moment-${suffix}`)
      .send({
        visibility: 'public',
        segments: [
          {
            mediaId: intent.body.id,
            durationMs: 4000,
            altText: 'Moss tile',
            stickers: [
              { kind: 'text', x: 0.5, y: 0.8, payload: { text: 'Not a story ring', color: '#F4EDE3' } },
              { kind: 'poll', x: 0.5, y: 0.6, payload: { prompt: 'Clay or moss?', options: ['Clay', 'Moss'] } },
            ],
          },
        ],
      })
      .expect(201);

    expect(created.body.publishedAt).toBeTruthy();
    expect(created.body.expiresAt).toBeTruthy();
    expect(created.body.segments[0].stickers).toHaveLength(2);

    const circles = await authorAgent
      .post('/v1/moments')
      .send({
        visibility: 'public',
        audience: 'circles',
        segments: [{ mediaId: 'placeholder' }],
      });
    expect(circles.status).toBe(400);

    await viewerAgent.post(`/v1/users/${author.handle}/follow`).expect(201);

    const tray = await viewerAgent.get('/v1/moments/tray').expect(200);
    expect(tray.body.rings.some((ring: { author: { handle: string } }) => ring.author.handle === author.handle)).toBe(
      true,
    );

    const segmentId = created.body.segments[0].id as string;
    const stickerId = created.body.segments[0].stickers.find((s: { kind: string }) => s.kind === 'poll').id as string;

    await viewerAgent.post(`/v1/moments/${created.body.id}/segments/${segmentId}/view`).expect(201);
    const reacted = await viewerAgent
      .post(`/v1/moments/${created.body.id}/segments/${segmentId}/reactions`)
      .send({ emoji: '✨' })
      .expect(201);
    expect(reacted.body.segments[0].reaction.mine).toBe('✨');

    const voted = await viewerAgent
      .post(`/v1/moments/${created.body.id}/stickers/${stickerId}/responses`)
      .send({ optionIndex: 1 })
      .expect(201);
    expect(voted.body.segments[0].stickers.find((s: { kind: string }) => s.kind === 'poll').mine.optionIndex).toBe(1);

    const reply = await viewerAgent.post(`/v1/moments/${created.body.id}/reply`).expect(201);
    expect(reply.body.id).toBeTruthy();
    expect(reply.body.lastMessage.kind).toBe('moment');

    const kept = await authorAgent
      .post(`/v1/moments/${created.body.id}/keep`)
      .send({ title: 'Studio light' })
      .expect(201);
    expect(kept.body.title).toBe('Studio light');
    expect(kept.body.items).toHaveLength(1);

    const shelves = await viewerAgent.get(`/v1/users/${author.handle}/reel-shelves`).expect(200);
    expect(shelves.body.items[0].title).toBe('Studio light');

    await prisma.moment.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await expireMoments(prisma, storage.inner);
    expect(expired.kept).toBeGreaterThanOrEqual(1);

    const gone = await viewerAgent.get(`/v1/moments/${created.body.id}`).expect(404);
    expect(gone.body.error.code).toBe('NOT_FOUND');

    const shelf = await viewerAgent
      .get(`/v1/users/${author.handle}/reel-shelves/${kept.body.id}`)
      .expect(200);
    expect(shelf.body.items[0].moment.id).toBe(created.body.id);
  });
});

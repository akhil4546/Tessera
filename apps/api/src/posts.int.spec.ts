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

describeDb('posts & following feed (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const author = {
    email: `ravi.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ravi_${suffix}`.slice(0, 30),
    displayName: 'Ravi',
    dateOfBirth: '1991-11-02',
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [author.email, viewer.email] } } });
    await app.close();
  });

  it('upload → post → follow → feed → appreciate → comment → mosaic', async () => {
    const authorAgent = request.agent(app.getHttpServer());
    const viewerAgent = request.agent(app.getHttpServer());
    await authorAgent.post('/v1/auth/register').send(author).expect(201);
    await viewerAgent.post('/v1/auth/register').send(viewer).expect(201);

    const jpeg = await sharp({
      create: { width: 64, height: 80, channels: 3, background: { r: 184, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();

    const intent = await authorAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
      .expect(201);
    expect(intent.body.driver).toBe('fs');

    await authorAgent
      .post(`/v1/media/${intent.body.id}/bytes`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(201);

    const completed = await authorAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
    expect(completed.body.status).toBe('ready');
    expect(completed.body.srcset.length).toBeGreaterThan(0);

    const created = await authorAgent
      .post('/v1/posts')
      .set('Idempotency-Key', `post-${suffix}`)
      .send({
        media: [{ id: intent.body.id, altText: 'A clay-coloured tile', filterId: 'none' }],
        caption: 'Morning light with @ghost and #granite',
        authenticity: 'unfiltered',
        visibility: 'public',
      })
      .expect(201);
    expect(created.body.unfiltered).toBe(true);
    expect(created.body.hashtags).toContain('granite');
    expect(created.body.publishedAt).toBeTruthy();

    await viewerAgent.post(`/v1/users/${author.handle}/follow`).expect(201);

    const feed = await viewerAgent.get('/v1/feed/following').expect(200);
    expect(feed.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
    expect(feed.body.finishLine.reached).toBe(true);
    expect(feed.body.finishLine.seenSinceLastVisit).toBe(1);
    expect(feed.body.items[0].appreciation.counts).toBeNull();

    const loved = await viewerAgent
      .post(`/v1/posts/${created.body.id}/appreciations`)
      .send({ type: 'love' })
      .expect(201);
    expect(loved.body.appreciation.mine).toBe('love');
    expect(loved.body.appreciation.counts).toBeNull();

    const asAuthor = await authorAgent.get(`/v1/posts/${created.body.id}`).expect(200);
    expect(asAuthor.body.appreciation.counts.love).toBe(1);

    const comment = await viewerAgent
      .post(`/v1/posts/${created.body.id}/comments`)
      .send({ body: 'Beautiful grain.' })
      .expect(201);
    expect(comment.body.body).toBe('Beautiful grain.');

    await authorAgent.put('/v1/me/hero-tiles').send({ postIds: [created.body.id] }).expect(200);
    const mosaic = await viewerAgent.get(`/v1/users/${author.handle}/mosaic`).expect(200);
    expect(mosaic.body.tiles[0].role).toBe('hero');
    expect(mosaic.body.tiles[0].span).toEqual({ cols: 2, rows: 2 });
  });
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegAvailable, synthesizeTestVideo } from '@tessera/media';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { PrismaService } from './prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('loops, audio reuse, wellbeing (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const author = {
    email: `kenji.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `kenji_${suffix}`.slice(0, 30),
    displayName: 'Kenji',
    dateOfBirth: '1995-09-18',
    client: 'web' as const,
  };
  const viewer = {
    email: `tess.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `tess_${suffix}`.slice(0, 30),
    displayName: 'Tess',
    dateOfBirth: '1997-10-11',
    client: 'web' as const,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(cookieParser());
    app.use(json({ limit: '2mb' }));
    app.use('/v1/media', (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'POST' && req.path.endsWith('/bytes')) {
        raw({ type: '*/*', limit: '8mb' })(req, res, next);
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

  it('wellbeing budget, labelled 501s, and Loop create/feed/watch when FFmpeg is present', async () => {
    const authorAgent = request.agent(app.getHttpServer());
    const viewerAgent = request.agent(app.getHttpServer());
    await authorAgent.post('/v1/auth/register').send(author).expect(201);
    await viewerAgent.post('/v1/auth/register').send(viewer).expect(201);
    await viewerAgent.post(`/v1/users/${author.handle}/follow`).expect(201);

    const jpeg = await sharp({
      create: { width: 64, height: 80, channels: 3, background: { r: 200, g: 85, b: 61 } },
    })
      .jpeg()
      .toBuffer();
    const imageIntent = await authorAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length, purpose: 'loop' })
      .expect(201);
    await authorAgent.post(`/v1/media/${imageIntent.body.id}/bytes`).set('Content-Type', 'image/jpeg').send(jpeg);
    await authorAgent.post(`/v1/media/${imageIntent.body.id}/complete`);
    const imageLoop = await authorAgent.post('/v1/loops').send({
      clips: [{ mediaId: imageIntent.body.id, trimEndMs: 2000 }],
      authenticity: 'unfiltered',
    });
    expect(imageLoop.status).toBe(400);

    const circles = await authorAgent.post('/v1/loops').send({
      clips: [{ mediaId: 'nope', trimEndMs: 1000 }],
      authenticity: 'edited',
      audience: 'circles',
    });
    expect(circles.status).toBe(400);

    const save = await viewerAgent.post('/v1/loops/any/save').expect(404);
    expect(save.body.error.code).toBe('NOT_FOUND');

    let wellbeing = await viewerAgent.put('/v1/me/wellbeing').send({ loopsBudgetMinutes: 15 }).expect(200);
    expect(wellbeing.body.loopsBudgetMinutes).toBe(15);
    expect(wellbeing.body.paused).toBe(false);

    wellbeing = await viewerAgent.post('/v1/me/wellbeing/extend').expect(200);
    expect(wellbeing.body.bonusMinutesToday).toBe(10);

    wellbeing = await viewerAgent.post('/v1/me/wellbeing/dismiss').expect(200);
    expect(wellbeing.body.dismissedToday).toBe(true);
    expect(wellbeing.body.paused).toBe(false);

    if (!(await ffmpegAvailable())) {
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'tessera-loop-int-'));
    const dest = path.join(dir, 'loop.mp4');
    try {
      await synthesizeTestVideo({ dest, durationSec: 2, withTone: true });
      const video = await readFile(dest);
      const intent = await authorAgent
        .post('/v1/media/intents')
        .send({ kind: 'video', mimeType: 'video/mp4', byteSize: video.length, purpose: 'loop' })
        .expect(201);
      await authorAgent
        .post(`/v1/media/${intent.body.id}/bytes`)
        .set('Content-Type', 'video/mp4')
        .send(video)
        .expect(201);
      const completed = await authorAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
      expect(completed.body.status).toBe('ready');
      expect(completed.body.durationMs).toBeGreaterThan(500);

      const created = await authorAgent
        .post('/v1/loops')
        .set('Idempotency-Key', `loop-${suffix}`)
        .send({
          clips: [{ mediaId: intent.body.id, trimStartMs: 0, trimEndMs: completed.body.durationMs, speed: 1 }],
          authenticity: 'unfiltered',
          caption: 'Original audio from the yard. #clay',
          allowAudioReuse: true,
          overlays: [{ text: 'clay', x: 0.5, y: 0.8 }],
        })
        .expect(201);
      expect(created.body.kind).toBe('loop');

      let loop = created.body;
      for (let i = 0; i < 40 && loop.media?.[0]?.status !== 'ready'; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
        loop = (await authorAgent.get(`/v1/loops/${created.body.id}`).expect(200)).body;
      }
      expect(loop.media[0].status).toBe('ready');
      expect(loop.media[0].hlsUrl).toBeTruthy();
      expect(loop.loop.captionStatus).toMatch(/ready|skipped|failed/);
      expect(loop.hashtags).toContain('clay');

      const feed = await viewerAgent.get('/v1/loops/feed').expect(200);
      expect(feed.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

      await viewerAgent.put('/v1/me/wellbeing').send({ loopsBudgetMinutes: 5 }).expect(200);
      const watched = await viewerAgent.post(`/v1/loops/${created.body.id}/watch`).send({ seconds: 5 }).expect(200);
      expect(watched.body.watchedSecondsToday).toBeGreaterThanOrEqual(5);

      const audio = await viewerAgent.get('/v1/audio').expect(200);
      expect(Array.isArray(audio.body.items)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../common/http-filter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fsMediaUrl } from '../storage/fs-media-url.js';
import { StorageService } from '../storage/storage.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('filesystem media reads (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  const suffix = `${Date.now()}`;
  const author = {
    email: `media.author.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ma_${suffix}`.slice(0, 30),
    displayName: 'Media Author',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const stranger = {
    email: `media.stranger.${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ms_${suffix}`.slice(0, 30),
    displayName: 'Media Stranger',
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
    await prisma.user.deleteMany({ where: { email: { in: [author.email, stranger.email] } } });
    await app.close();
  });

  it('hides a followers-only media key from anonymous callers, serves the owner URL, and rejects an expired token', async () => {
    const authorAgent = request.agent(app.getHttpServer());
    const strangerAgent = request.agent(app.getHttpServer());
    await authorAgent.post('/v1/auth/register').send(author).expect(201);
    await strangerAgent.post('/v1/auth/register').send(stranger).expect(201);

    const jpeg = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 40, g: 90, b: 70 } },
    })
      .jpeg()
      .toBuffer();

    const intent = await authorAgent
      .post('/v1/media/intents')
      .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length, purpose: 'post' })
      .expect(201);

    await authorAgent
      .post(`/v1/media/${intent.body.id}/bytes`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(201);

    const completed = await authorAgent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
    expect(completed.body.status).toBe('ready');
    const signed = completed.body.srcset.at(-1)?.webp as string;
    expect(signed.startsWith('/v1/media/file/')).toBe(true);

    const created = await authorAgent
      .post('/v1/posts')
      .send({
        media: [{ id: intent.body.id, altText: 'A private tile', filterId: 'none' }],
        caption: 'Followers only',
        authenticity: 'unfiltered',
        visibility: 'followers',
      })
      .expect(201);
    expect(created.body.visibility).toBe('followers');
    await strangerAgent.get(`/v1/posts/${created.body.id}`).expect(404);

    const server = app.getHttpServer();
    const bare = signed.split('?')[0] ?? signed;
    const anonymous = await request(server).get(bare);
    expect(anonymous.status).toBe(403);
    expect(anonymous.body.error.code).toBe('MEDIA_URL_INVALID');

    const key = decodeURIComponent(bare.slice('/v1/media/file/'.length));
    const stale = await request(server).get(fsMediaUrl(key, 1));
    expect(stale.status).toBe(403);
    expect(stale.body.error.code).toBe('MEDIA_URL_INVALID');

    const tampered = signed.replace(/sig=([^&]+)/, (_match, sig: string) => {
      const flipped = sig.endsWith('a') ? 'b' : 'a';
      return `sig=${sig.slice(0, -1)}${flipped}`;
    });
    expect(tampered).not.toBe(signed);
    await request(server).get(tampered).expect(403);

    const owned = await authorAgent.get(signed).expect(200);
    expect(owned.headers['content-type']).toMatch(/image\/webp/);
    expect(owned.body.length).toBeGreaterThan(0);
    const withoutSession = await request(server).get(signed).expect(200);
    expect(withoutSession.body.length).toBe(owned.body.length);
  });

  it('keeps the path traversal guard and still rewrites filesystem playlists', async () => {
    const server = app.getHttpServer();
    const traversal = await request(server).get('/v1/media/file/..%2Fsecret');
    expect(traversal.status).toBe(400);
    const signedTraversal = fsMediaUrl(`post/${suffix}/../secret.txt`, Math.floor(Date.now() / 1000) + 60);
    expect((await request(server).get(signedTraversal)).status).toBe(400);

    const segmentKey = `post/media-file-${suffix}/seg0.ts`;
    const playlistKey = `post/media-file-${suffix}/master.m3u8`;
    await storage.put(segmentKey, Buffer.from('segment-bytes'), 'video/MP2T');
    await storage.put(
      playlistKey,
      Buffer.from('#EXTM3U\nhttps://cdn.example/keep.ts\n./seg0.ts\n', 'utf8'),
      'application/vnd.apple.mpegurl',
    );
    try {
      const playlistUrl = await storage.signGet(playlistKey, 120);
      expect(playlistUrl).toMatch(/[?&]exp=\d+/);
      expect(playlistUrl).toMatch(/[?&]sig=[^&]+/);
      const playlist = await request(server).get(playlistUrl!).expect(200);
      expect(playlist.headers['content-type']).toMatch(/mpegurl/);
      const lines = playlist.text.split('\n');
      expect(lines).toContain('https://cdn.example/keep.ts');
      const child = lines.find((line) => line.includes('seg0.ts'));
      expect(child).toMatch(/[?&]exp=\d+/);
      expect(child).toMatch(/[?&]sig=[^&]+/);
      expect(child).not.toContain('..');
      const parentExp = new URL(playlistUrl!, 'http://localhost').searchParams.get('exp');
      const childExp = new URL(child!, 'http://localhost').searchParams.get('exp');
      expect(childExp).toBe(parentExp);
      const segment = await request(server).get(child!).expect(200);
      expect(Buffer.from(segment.body).toString('utf8')).toBe('segment-bytes');
    } finally {
      await storage.inner.delete(segmentKey);
      await storage.inner.delete(playlistKey);
    }
  });
});

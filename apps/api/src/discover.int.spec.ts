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

describeDb('discovery: search, hashtags, places, ranking (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const viewer = {
    email: `asha.d${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_d${suffix}`.slice(0, 30),
    displayName: 'Asha D',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const friend = {
    email: `ravi.d${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ravi_d${suffix}`.slice(0, 30),
    displayName: 'Ravi D',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const stranger = {
    email: `omar.d${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `omar_d${suffix}`.slice(0, 30),
    displayName: 'Omar D',
    dateOfBirth: '1990-12-01',
    client: 'web' as const,
  };
  const newbie = {
    email: `tess.d${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `tess_d${suffix}`.slice(0, 30),
    displayName: 'Tess D',
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
      where: { email: { in: [viewer.email, friend.email, stranger.email, newbie.email] } },
    });
    await app.close();
  });

  it('search, hashtags, places, Memory Map, truthful Discover ranking and sliders', async () => {
    const asha = request.agent(app.getHttpServer());
    const ravi = request.agent(app.getHttpServer());
    const omar = request.agent(app.getHttpServer());
    const tess = request.agent(app.getHttpServer());
    await asha.post('/v1/auth/register').send(viewer).expect(201);
    await ravi.post('/v1/auth/register').send(friend).expect(201);
    await omar.post('/v1/auth/register').send(stranger).expect(201);
    await tess.post('/v1/auth/register').send(newbie).expect(201);
    await asha.post(`/v1/users/${friend.handle}/follow`).expect(201);

    const jpeg = await jpegTile();

    async function publish(
      agent: ReturnType<typeof request.agent>,
      caption: string,
      locationName?: string,
    ) {
      const intent = await agent
        .post('/v1/media/intents')
        .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
        .expect(201);
      await agent.post(`/v1/media/${intent.body.id}/bytes`).set('Content-Type', 'image/jpeg').send(jpeg);
      await agent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
      return agent
        .post('/v1/posts')
        .send({
          media: [{ id: intent.body.id, altText: 'tile' }],
          caption,
          authenticity: 'unfiltered',
          locationName,
        })
        .expect(201);
    }

    const ashaPost = await publish(asha, 'Granite at Hampi. #climb', 'Hampi boulders');
    expect(ashaPost.body.place?.slug).toBe('hampi-boulders');

    const raviPost = await publish(ravi, 'Chair grain. #wood');
    await asha.post(`/v1/posts/${raviPost.body.id}/appreciations`).send({ type: 'useful' }).expect(201);

    const omarClay = await publish(omar, 'Dust on the courtyard. #clay', 'Jaipur courtyard');
    const omarHampi = await publish(omar, 'Same rock, other hour. #climb', 'Hampi boulders');
    const tessPost = await publish(tess, 'A quiet bench. #garden');

    await prisma.place.updateMany({
      where: { slug: 'hampi-boulders' },
      data: { lat: 15.335, lng: 76.46 },
    });
    await prisma.place.updateMany({
      where: { slug: 'jaipur-courtyard' },
      data: { lat: 26.9124, lng: 75.7873 },
    });

    const boards = await asha.get('/v1/search/boards?q=saved').expect(200);
    expect(Array.isArray(boards.body.items)).toBe(true);

    const search = await asha.get('/v1/search?q=clay').expect(200);
    expect(search.body.engine).toMatch(/postgres|meilisearch/);
    expect(Array.isArray(search.body.boards)).toBe(true);
    expect(search.body.hashtags.some((row: { tag: string }) => row.tag === 'clay')).toBe(true);
    expect(search.body.captions.some((row: { post: { id: string } }) => row.post.id === omarClay.body.id)).toBe(true);

    const people = await asha.get(`/v1/search?q=${stranger.handle}&tab=people`).expect(200);
    expect(people.body.people.some((row: { handle: string }) => row.handle === stranger.handle)).toBe(true);

    const recent = await asha.get('/v1/search/recent').expect(200);
    expect(recent.body.items.some((row: { query: string }) => row.query === 'clay')).toBe(true);
    await asha.delete('/v1/search/recent').expect(200);
    expect((await asha.get('/v1/search/recent').expect(200)).body.items).toEqual([]);

    await asha.post(`/v1/posts/${omarClay.body.id}/appreciations`).send({ type: 'inspiring' }).expect(201);

    const defaults = await asha.get('/v1/feed/discover').expect(200);
    expect(defaults.body.engine).toBe('rules');
    const defaultIds = defaults.body.items.map((row: { post: { id: string } }) => row.post.id);
    expect(defaultIds).toContain(omarClay.body.id);
    expect(defaultIds).toContain(tessPost.body.id);
    expect(defaultIds).not.toContain(raviPost.body.id);
    expect(defaultIds).not.toContain(ashaPost.body.id);

    const omarItem = defaults.body.items.find((row: { post: { id: string } }) => row.post.id === omarClay.body.id);
    expect(omarItem.signals.length).toBeGreaterThan(0);
    const signalSum = omarItem.signals.reduce((sum: number, row: { contribution: number }) => sum + row.contribution, 0);
    expect(signalSum).toBeCloseTo(omarItem.score, 4);

    const why = await asha.get(`/v1/feed/discover/impressions/${omarItem.impressionId}`).expect(200);
    expect(why.body.signals).toEqual(omarItem.signals);

    await asha
      .put('/v1/me/discover')
      .send({ peopleIInteractWith: 1, newCreators: 0, nearby: 0, lessVideo: 0 })
      .expect(200);
    const interactHeavy = await asha.get('/v1/feed/discover').expect(200);
    expect(interactHeavy.body.items[0]?.post.id).toBe(omarClay.body.id);
    expect(interactHeavy.body.items[0]?.signals.some((row: { key: string }) => row.key === 'interact')).toBe(true);

    await asha
      .put('/v1/me/discover')
      .send({ peopleIInteractWith: 0, newCreators: 1, nearby: 0, lessVideo: 0 })
      .expect(200);
    const newHeavy = await asha.get('/v1/feed/discover').expect(200);
    expect(newHeavy.body.weights.newCreators).toBe(1);
    expect(newHeavy.body.weights.peopleIInteractWith).toBe(0);
    const tessItem = newHeavy.body.items.find((row: { post: { id: string } }) => row.post.id === tessPost.body.id);
    expect(tessItem).toBeTruthy();
    expect(tessItem.signals.some((row: { key: string }) => row.key === 'new_creator')).toBe(true);
    expect(tessItem.signals.some((row: { key: string }) => row.key === 'interact')).toBe(false);

    await asha
      .put('/v1/me/discover')
      .send({ peopleIInteractWith: 0, newCreators: 0, nearby: 1, lessVideo: 0 })
      .expect(200);
    const nearbyHeavy = await asha.get('/v1/feed/discover').expect(200);
    expect(nearbyHeavy.body.items[0]?.post.id).toBe(omarHampi.body.id);
    expect(nearbyHeavy.body.items[0]?.signals.some((row: { key: string }) => row.key === 'nearby')).toBe(true);

    await asha.post('/v1/hashtags/clay/follow').expect(201);
    const tagPage = await asha.get('/v1/hashtags/clay?sort=recent').expect(200);
    expect(tagPage.body.followed).toBe(true);
    expect(tagPage.body.items.some((row: { id: string }) => row.id === omarClay.body.id)).toBe(true);
    expect(tagPage.body.items.some((row: { id: string }) => row.id === raviPost.body.id)).toBe(false);

    const place = await asha.get('/v1/places/hampi-boulders?sort=recent').expect(200);
    expect(place.body.name).toBe('Hampi boulders');
    expect(place.body.items.length).toBeGreaterThanOrEqual(2);

    const map = await asha.get(`/v1/users/${viewer.handle}/memory-map`).expect(200);
    expect(map.body.visible).toBe(true);
    expect(map.body.pins.some((pin: { place: { slug: string } }) => pin.place.slug === 'hampi-boulders')).toBe(true);

    await asha.patch('/v1/me').send({ memoryMapEnabled: false }).expect(200);
    const hidden = await omar.get(`/v1/users/${viewer.handle}/memory-map`).expect(200);
    expect(hidden.body.visible).toBe(false);
    expect(hidden.body.pins).toEqual([]);
    await asha.patch('/v1/me').send({ memoryMapEnabled: true }).expect(200);

    const suggestions = await asha.get('/v1/discover/people').expect(200);
    expect(suggestions.body.items.some((row: { profile: { handle: string } }) => row.profile.handle === stranger.handle)).toBe(
      true,
    );
    await asha.post(`/v1/discover/people/${stranger.handle}/dismiss`).expect(201);
    const afterDismiss = await asha.get('/v1/discover/people').expect(200);
    expect(
      afterDismiss.body.items.some((row: { profile: { handle: string } }) => row.profile.handle === stranger.handle),
    ).toBe(false);

    const circles = await asha.post('/v1/posts').send({
      media: [{ id: 'nope' }],
      authenticity: 'edited',
      audience: 'circles',
    });
    expect(circles.status).toBe(400);
  });
});

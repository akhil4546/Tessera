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
import { QueueService } from './queue/queue.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('organisation: Circles, Boards, drafts, scheduled posts (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queues: QueueService;
  const suffix = `${Date.now()}`;
  const asha = {
    email: `asha.o${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `asha_o${suffix}`.slice(0, 30),
    displayName: 'Asha O',
    dateOfBirth: '1994-03-12',
    client: 'web' as const,
  };
  const ravi = {
    email: `ravi.o${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `ravi_o${suffix}`.slice(0, 30),
    displayName: 'Ravi O',
    dateOfBirth: '1991-11-02',
    client: 'web' as const,
  };
  const nia = {
    email: `nia.o${suffix}@tessera.test`,
    password: 'Seedpass1!',
    handle: `nia_o${suffix}`.slice(0, 30),
    displayName: 'Nia O',
    dateOfBirth: '1998-05-09',
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
    queues = app.get(QueueService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [asha.email, ravi.email, nia.email] } },
    });
    await app.close();
  });

  it('Circles, Boards, drafts, and scheduled publishing', async () => {
    const ashaAgent = request.agent(app.getHttpServer());
    const raviAgent = request.agent(app.getHttpServer());
    const niaAgent = request.agent(app.getHttpServer());
    await ashaAgent.post('/v1/auth/register').send(asha).expect(201);
    await raviAgent.post('/v1/auth/register').send(ravi).expect(201);
    await niaAgent.post('/v1/auth/register').send(nia).expect(201);

    const climbing = await ashaAgent.post('/v1/me/circles').send({ name: 'Climbing crew' }).expect(201);
    expect(climbing.body.name).toBe('Climbing crew');
    await ashaAgent.post(`/v1/me/circles/${climbing.body.id}/members`).send({ handle: ravi.handle }).expect(201);
    const detail = await ashaAgent.get(`/v1/me/circles/${climbing.body.id}`).expect(200);
    expect(detail.body.members.some((row: { handle: string }) => row.handle === ravi.handle)).toBe(true);
    const asRavi = await raviAgent.get('/v1/me/circles').expect(200);
    expect(asRavi.body.items).toEqual([]);

    const jpeg = await sharp({
      create: { width: 64, height: 80, channels: 3, background: { r: 91, g: 117, b: 83 } },
    })
      .jpeg()
      .toBuffer();

    async function upload(agent: typeof ashaAgent) {
      const intent = await agent
        .post('/v1/media/intents')
        .send({ kind: 'image', mimeType: 'image/jpeg', byteSize: jpeg.length })
        .expect(201);
      await agent.post(`/v1/media/${intent.body.id}/bytes`).set('Content-Type', 'image/jpeg').send(jpeg).expect(201);
      await agent.post(`/v1/media/${intent.body.id}/complete`).expect(201);
      return intent.body.id as string;
    }

    const circleMedia = await upload(ashaAgent);
    const circlePost = await ashaAgent
      .post('/v1/posts')
      .send({
        media: [{ id: circleMedia, altText: 'Chalk on granite' }],
        caption: 'Only the crew sees this.',
        authenticity: 'unfiltered',
        audience: 'circles',
        circleIds: [climbing.body.id],
      })
      .expect(201);
    expect(circlePost.body.visibility).toBe('circles');
    expect(circlePost.body.publishedAt).toBeTruthy();

    const raviView = await raviAgent.get(`/v1/posts/${circlePost.body.id}`).expect(200);
    expect(raviView.body.id).toBe(circlePost.body.id);
    await niaAgent.get(`/v1/posts/${circlePost.body.id}`).expect(404);

    const raviFeed = await raviAgent.get('/v1/feed/following').expect(200);
    expect(raviFeed.body.items.some((item: { id: string }) => item.id === circlePost.body.id)).toBe(true);
    const niaFeed = await niaAgent.get('/v1/feed/following').expect(200);
    expect(niaFeed.body.items.some((item: { id: string }) => item.id === circlePost.body.id)).toBe(false);

    const missingCircles = await ashaAgent.post('/v1/posts').send({
      media: [{ id: 'nope' }],
      authenticity: 'edited',
      audience: 'circles',
    });
    expect(missingCircles.status).toBe(400);

    const publicMedia = await upload(ashaAgent);
    const publicPost = await ashaAgent
      .post('/v1/posts')
      .send({
        media: [{ id: publicMedia, altText: 'A public tile' }],
        caption: 'Anyone can keep this.',
        authenticity: 'unfiltered',
        visibility: 'public',
      })
      .expect(201);

    const saved = await raviAgent.post(`/v1/posts/${publicPost.body.id}/save`).send({}).expect(201);
    expect(saved.body.board.isDefault).toBe(true);
    expect(saved.body.board.title).toBe('Saved');

    const granite = await raviAgent
      .post('/v1/boards')
      .send({ title: 'Granite', visibility: 'public', description: 'Holds we like' })
      .expect(201);
    await raviAgent.post(`/v1/posts/${publicPost.body.id}/save`).send({ boardId: granite.body.id }).expect(201);
    await raviAgent.post(`/v1/boards/${granite.body.id}/collaborators`).send({ handle: asha.handle }).expect(201);

    const activity = await ashaAgent.get('/v1/notifications').expect(200);
    expect(activity.body.items.some((row: { kind: string }) => row.kind === 'board_invite')).toBe(true);

    await ashaAgent.post(`/v1/boards/${granite.body.id}/accept`).expect(201);
    const boardsSearch = await ashaAgent.get('/v1/search/boards?q=Granite').expect(200);
    expect(boardsSearch.body.items.some((row: { id: string }) => row.id === granite.body.id)).toBe(true);
    const unified = await ashaAgent.get('/v1/search?q=Granite').expect(200);
    expect(unified.body.boards.some((row: { id: string }) => row.id === granite.body.id)).toBe(true);

    await niaAgent.post(`/v1/boards/${granite.body.id}/follow`).expect(201);
    const niaFollowing = await niaAgent.get('/v1/me/boards/following').expect(200);
    expect(niaFollowing.body.items.some((row: { id: string }) => row.id === granite.body.id)).toBe(true);

    const loopSaveMissing = await raviAgent.post('/v1/loops/not-a-loop/save').expect(404);
    expect(loopSaveMissing.body.error.code).toBe('NOT_FOUND');

    const draft = await ashaAgent
      .post('/v1/drafts')
      .send({ kind: 'post', payload: { caption: 'Draft granite note' } })
      .expect(201);
    const drafts = await ashaAgent.get('/v1/drafts').expect(200);
    expect(drafts.body.items.some((row: { id: string }) => row.id === draft.body.id)).toBe(true);
    await ashaAgent
      .patch(`/v1/drafts/${draft.body.id}`)
      .send({ payload: { caption: 'Draft granite note, edited on another device' } })
      .expect(200);

    const scheduledMedia = await upload(ashaAgent);
    const when = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const scheduled = await ashaAgent
      .post('/v1/posts')
      .send({
        media: [{ id: scheduledMedia, altText: 'Later' }],
        caption: 'This goes live on a timer.',
        authenticity: 'unfiltered',
        scheduledAt: when,
      })
      .expect(201);
    expect(scheduled.body.publishedAt).toBeNull();
    expect(scheduled.body.scheduledAt).toBeTruthy();
    const listed = await ashaAgent.get('/v1/me/scheduled').expect(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === scheduled.body.id)).toBe(true);

    await prisma.post.update({
      where: { id: scheduled.body.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    await queues.publishDueScheduled();
    const live = await ashaAgent.get(`/v1/posts/${scheduled.body.id}`).expect(200);
    expect(live.body.publishedAt).toBeTruthy();
    const publishedNote = await ashaAgent.get('/v1/notifications').expect(200);
    expect(publishedNote.body.items.some((row: { kind: string }) => row.kind === 'scheduled_post_published')).toBe(
      true,
    );
  });
});

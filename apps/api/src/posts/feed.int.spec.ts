import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FEED_FANOUT_FOLLOWER_THRESHOLD } from '@tessera/types';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../common/http-filter.js';
import { PrismaService } from '../prisma/prisma.service.js';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('following feed pagination (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`;
  const fillerPrefix = `fu${suffix}`;
  const emails = {
    viewer: `viewer.${suffix}@tessera.test`,
    fan: `fan.${suffix}@tessera.test`,
    high: `high.${suffix}@tessera.test`,
    circle: `circle.${suffix}@tessera.test`,
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
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          OR: [{ email: { in: Object.values(emails) } }, { id: { startsWith: fillerPrefix } }],
        },
      });
    }
    await app?.close();
  }, 120_000);

  it('walks three pages across fan-out, circles, and high-follower posts without overlap', async () => {
    const viewer = {
      email: emails.viewer,
      password: 'Seedpass1!',
      handle: `viewer_${suffix}`.slice(0, 30),
      displayName: 'Viewer',
      dateOfBirth: '1994-03-12',
      client: 'web' as const,
    };
    const agent = request.agent(app.getHttpServer());
    const registered = await agent.post('/v1/auth/register').send(viewer).expect(201);
    const viewerId = registered.body.user.id as string;

    const fan = await prisma.user.create({
      data: {
        email: emails.fan,
        handle: `fan_${suffix}`.slice(0, 30),
        dateOfBirth: new Date('1991-04-04'),
        profile: { create: { displayName: 'Fan Author' } },
      },
    });
    const high = await prisma.user.create({
      data: {
        email: emails.high,
        handle: `high_${suffix}`.slice(0, 30),
        dateOfBirth: new Date('1990-02-02'),
        profile: { create: { displayName: 'High Author' } },
      },
    });
    const circleAuthor = await prisma.user.create({
      data: {
        email: emails.circle,
        handle: `circ_${suffix}`.slice(0, 30),
        dateOfBirth: new Date('1993-06-06'),
        profile: { create: { displayName: 'Circle Author' } },
      },
    });

    const fillerCount = FEED_FANOUT_FOLLOWER_THRESHOLD - 1;
    await prisma.$executeRaw`
      INSERT INTO "users" ("id", "email", "handle", "dateOfBirth", "updatedAt")
      SELECT
        ${fillerPrefix} || CAST(gs.i AS TEXT),
        ${`pad.${suffix}.`} || CAST(gs.i AS TEXT) || '@tessera.test',
        ${`p${suffix}`} || CAST(gs.i AS TEXT),
        DATE '1990-01-01',
        CURRENT_TIMESTAMP
      FROM generate_series(1, CAST(${fillerCount} AS INTEGER)) AS gs(i)
    `;
    await prisma.$executeRaw`
      INSERT INTO "follows" ("id", "followerId", "followeeId", "status", "acceptedAt")
      SELECT
        'fol' || u."id",
        u."id",
        ${high.id},
        'accepted',
        CURRENT_TIMESTAMP
      FROM "users" u
      WHERE u."id" LIKE ${`${fillerPrefix}%`}
    `;
    await prisma.follow.createMany({
      data: [
        { followerId: viewerId, followeeId: fan.id, status: 'accepted', acceptedAt: new Date() },
        { followerId: viewerId, followeeId: high.id, status: 'accepted', acceptedAt: new Date() },
      ],
    });
    const highFollowers = await prisma.follow.count({
      where: { followeeId: high.id, status: 'accepted' },
    });
    expect(highFollowers).toBe(FEED_FANOUT_FOLLOWER_THRESHOLD);

    const at = (second: number) => new Date(Date.UTC(2026, 0, 15, 12, 0, second));
    // Same publishedAt, ids ordered so `b` sorts before `a` on id DESC.
    const ids = {
      fanA: `p${suffix}fa`,
      highA: `p${suffix}ha`,
      circA: `p${suffix}ca`,
      fanB: `p${suffix}b`,
      fanC: `p${suffix}a`,
      circB: `p${suffix}cb`,
    };
    const posts = [
      { id: ids.fanA, authorId: fan.id, publishedAt: at(60), visibility: 'public' as const },
      { id: ids.highA, authorId: high.id, publishedAt: at(50), visibility: 'public' as const },
      { id: ids.circA, authorId: circleAuthor.id, publishedAt: at(40), visibility: 'circles' as const },
      { id: ids.fanB, authorId: fan.id, publishedAt: at(30), visibility: 'public' as const },
      { id: ids.fanC, authorId: fan.id, publishedAt: at(30), visibility: 'public' as const },
      { id: ids.circB, authorId: circleAuthor.id, publishedAt: at(20), visibility: 'circles' as const },
    ];
    await prisma.post.createMany({
      data: posts.map((post) => ({
        ...post,
        authenticity: 'unfiltered' as const,
        caption: post.id,
      })),
    });

    // High-follower and Circle posts are intentionally absent from FeedEntry.
    // A correct page order has to merge and cursor those read-time branches with fan-out.
    await prisma.feedEntry.createMany({
      data: [ids.fanA, ids.fanB, ids.fanC].map((postId) => ({
        userId: viewerId,
        postId,
        authorId: fan.id,
        publishedAt: posts.find((post) => post.id === postId)!.publishedAt,
      })),
    });
    const circle = await prisma.circle.create({
      data: {
        ownerId: circleAuthor.id,
        name: 'Crew',
        members: { create: { userId: viewerId } },
      },
    });
    await prisma.postAudience.createMany({
      data: [ids.circA, ids.circB].map((postId) => ({ postId, circleId: circle.id })),
    });

    const storedEntries = await prisma.feedEntry.findMany({
      where: { userId: viewerId },
      select: { postId: true },
    });
    expect(storedEntries.map((entry) => entry.postId).sort()).toEqual([ids.fanA, ids.fanB, ids.fanC].sort());

    const expected = [ids.fanA, ids.highA, ids.circA, ids.fanB, ids.fanC, ids.circB];
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const response = await agent
        .get('/v1/feed/following')
        .query(cursor ? { limit: 2, cursor } : { limit: 2 })
        .expect(200);
      const pageIds = response.body.items.map((item: { id: string }) => item.id);
      expect(pageIds).toEqual(expected.slice(page * 2, page * 2 + 2));
      seen.push(...pageIds);
      expect(response.body.finishLine.seenSinceLastVisit).toBe(expected.length);
      expect(response.body.finishLine.reached).toBe(page === 2);
      expect(response.body.finishLine.olderAvailable).toBe(false);
      expect(response.body.keepGoing).toBe(false);
      if (page < 2) {
        expect(typeof response.body.nextCursor).toBe('string');
        cursor = response.body.nextCursor as string;
      } else {
        expect(response.body.nextCursor).toBeNull();
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
  }, 120_000);
});

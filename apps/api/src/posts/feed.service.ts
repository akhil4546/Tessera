import { Injectable } from '@nestjs/common';
import { highFollowerAuthorIds, muteHidesPosts, sliceFollowingFeed } from '@tessera/media';
import type { FollowingFeed } from '@tessera/types';
import { cursorWherePublished, encodeCursor } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { POST_INCLUDE, PostsService } from './posts.service.js';

/** One extra row per branch so the merge can fill `limit` and detect another page. */
const FEED_BRANCH_OVERFETCH = 1;

type PublishedWindow = { not: null } | { gt: Date } | { lte: Date };

function notHidden(hiddenAuthors: string[]): { notIn: string[] } {
  return { notIn: hiddenAuthors.length ? hiddenAuthors : ['__none__'] };
}

/** New posts are strictly after the finish line. `keepGoing` reads the older side. */
function publishedWindow(keepGoing: boolean, caughtUpAt: Date | null): PublishedWindow {
  if (keepGoing) return { lte: caughtUpAt ?? new Date(0) };
  if (caughtUpAt) return { gt: caughtUpAt };
  return { not: null };
}

function livePost(
  userId: string,
  hideSensitive: boolean,
  publishedAt: PublishedWindow,
  extra?: Record<string, unknown>,
) {
  return {
    deletedAt: null,
    takenDownAt: null,
    archivedAt: null,
    publishedAt,
    ...(hideSensitive ? { AND: [{ OR: [{ authorId: userId }, { sensitive: false }] }] } : {}),
    ...extra,
  };
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  async following(userId: string, opts: { cursor?: string; limit: number; keepGoing: boolean }): Promise<FollowingFeed> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followeeId: true },
    });
    const authorIds = [userId, ...follows.map((row) => row.followeeId)];
    const mutes = await this.prisma.mute.findMany({ where: { muterId: userId } });
    const muted = new Set(
      mutes.filter((row) => muteHidesPosts(row.scope)).map((row) => row.mutedId),
    );
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    const blocked = new Set(
      blocks.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)),
    );
    const allowedAuthors = authorIds.filter((id) => !muted.has(id) && !blocked.has(id));
    const hiddenAuthors = [...muted, ...blocked];
    const hidden = notHidden(hiddenAuthors);

    const [high, sensitivity, state] = await Promise.all([
      highFollowerAuthorIds(this.prisma, allowedAuthors),
      this.prisma.profile.findUnique({
        where: { userId },
        select: { sensitivityLevel: true },
      }),
      this.prisma.feedState.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
    ]);
    const fanoutAuthors = allowedAuthors.filter((id) => !high.has(id));
    const fanoutIds = fanoutAuthors.length ? fanoutAuthors : ['__none__'];
    const highIds = [...high];
    const hideSensitive = sensitivity?.sensitivityLevel === 'hide';
    const take = opts.limit + FEED_BRANCH_OVERFETCH;
    // FeedEntry is ordered by postId, not its own id. The cursor carries the post id.
    const postCursor = cursorWherePublished(opts.cursor);
    const entryCursor = cursorWherePublished(opts.cursor, 'postId');
    const window = publishedWindow(opts.keepGoing, state.followingCaughtUpAt);
    const since = { gt: state.followingCaughtUpAt ?? new Date(0) } as const;
    const sensitiveAnd = hideSensitive ? [{ OR: [{ authorId: userId }, { sensitive: false }] }] : [];

    const fanoutWhere = (publishedAt: PublishedWindow, cursor = false) => ({
      userId,
      authorId: hidden,
      // FeedEntry.publishedAt is required, so `{ not: null }` is not a valid filter.
      ...('not' in publishedAt ? {} : { publishedAt }),
      AND: [
        {
          OR: [
            { authorId: { in: fanoutIds }, post: livePost(userId, hideSensitive, publishedAt) },
            { post: livePost(userId, hideSensitive, publishedAt, { visibility: 'circles' }) },
          ],
        },
        ...(cursor && entryCursor ? [entryCursor] : []),
      ],
    });
    const circleWhere = (publishedAt: PublishedWindow, cursor = false, excludeFanout = false) => ({
      visibility: 'circles' as const,
      deletedAt: null,
      takenDownAt: null,
      archivedAt: null,
      publishedAt,
      authorId: hidden,
      audiences: { some: { circle: { members: { some: { userId } } } } },
      ...(excludeFanout ? { feedEntries: { none: { userId } } } : {}),
      ...((sensitiveAnd.length || (cursor && postCursor))
        ? { AND: [...sensitiveAnd, ...(cursor && postCursor ? [postCursor] : [])] }
        : {}),
    });
    const highWhere = (publishedAt: PublishedWindow, cursor = false) => ({
      authorId: { in: highIds },
      visibility: { in: ['public' as const, 'followers' as const] },
      deletedAt: null,
      takenDownAt: null,
      archivedAt: null,
      publishedAt,
      ...((sensitiveAnd.length || (cursor && postCursor))
        ? { AND: [...sensitiveAnd, ...(cursor && postCursor ? [postCursor] : [])] }
        : {}),
    });

    const needsLine = !opts.keepGoing;
    const [fanout, extraCircles, extraHigh, sinceCount, olderHit] = await Promise.all([
      this.prisma.feedEntry.findMany({
        where: fanoutWhere(window, true),
        orderBy: [{ publishedAt: 'desc' }, { postId: 'desc' }],
        take,
        include: { post: { include: POST_INCLUDE } },
      }),
      this.prisma.post.findMany({
        where: circleWhere(window, true),
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take,
        include: POST_INCLUDE,
      }),
      highIds.length
        ? this.prisma.post.findMany({
            where: highWhere(window, true),
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take,
            include: POST_INCLUDE,
          })
        : Promise.resolve([]),
      needsLine
        ? Promise.all([
            this.prisma.feedEntry.count({ where: fanoutWhere(since) }),
            highIds.length ? this.prisma.post.count({ where: highWhere(since) }) : Promise.resolve(0),
            this.prisma.post.count({ where: circleWhere(since, false, true) }),
          ]).then((counts) => counts.reduce((sum, count) => sum + count, 0))
        : Promise.resolve(0),
      needsLine && state.followingCaughtUpAt
        ? Promise.all([
            this.prisma.feedEntry.findFirst({
              where: fanoutWhere({ lte: state.followingCaughtUpAt }),
              select: { id: true },
            }),
            highIds.length
              ? this.prisma.post.findFirst({
                  where: highWhere({ lte: state.followingCaughtUpAt }),
                  select: { id: true },
                })
              : Promise.resolve(null),
            this.prisma.post.findFirst({
              where: circleWhere({ lte: state.followingCaughtUpAt }),
              select: { id: true },
            }),
          ]).then((rows) => rows.some(Boolean))
        : Promise.resolve(false),
    ]);

    const merged = new Map<string, (typeof fanout)[number]['post']>();
    for (const entry of fanout) {
      if (entry.post.deletedAt || entry.post.takenDownAt || !entry.post.publishedAt || entry.post.archivedAt) continue;
      merged.set(entry.postId, entry.post);
    }
    for (const post of extraCircles) merged.set(post.id, post);
    for (const post of extraHigh) merged.set(post.id, post);

    const posts = [...merged.values()]
      .filter((post) => {
        if (!hideSensitive) return true;
        if (post.authorId === userId) return true;
        return !post.sensitive;
      })
      .sort((a, b) => {
        const ta = b.publishedAt!.getTime() - a.publishedAt!.getTime();
        if (ta !== 0) return ta;
        return b.id.localeCompare(a.id);
      });

    const sliced = sliceFollowingFeed({
      posts: posts.map((post) => ({ ...post, publishedAt: post.publishedAt! })),
      caughtUpAt: state.followingCaughtUpAt,
      keepGoing: opts.keepGoing,
      limit: opts.limit,
    });
    const finishLine = sliced.finishLine
      ? {
          reached: sliced.finishLine.reached,
          seenSinceLastVisit: sinceCount,
          olderAvailable: olderHit,
        }
      : null;

    if (!opts.keepGoing) {
      await this.prisma.feedState.update({
        where: { userId },
        data: {
          lastVisitAt: new Date(),
          lastVisitNewCount: finishLine?.seenSinceLastVisit ?? 0,
        },
      });
    }

    const items = [];
    for (const post of sliced.visible) {
      items.push(await this.posts.mapPost(post, userId));
    }
    const last = sliced.visible[sliced.visible.length - 1];
    return {
      items,
      nextCursor: sliced.hasMore && last?.publishedAt ? encodeCursor(last.publishedAt, last.id) : null,
      finishLine,
      keepGoing: opts.keepGoing,
    };
  }

  async markCaughtUp(userId: string): Promise<{ followingCaughtUpAt: string }> {
    const now = new Date();
    await this.prisma.feedState.upsert({
      where: { userId },
      create: { userId, followingCaughtUpAt: now, lastVisitAt: now, lastVisitNewCount: 0 },
      update: { followingCaughtUpAt: now, lastVisitNewCount: 0 },
    });
    return { followingCaughtUpAt: now.toISOString() };
  }
}

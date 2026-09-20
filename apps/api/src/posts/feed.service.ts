import { Injectable } from '@nestjs/common';
import { highFollowerAuthorIds, muteHidesPosts, sliceFollowingFeed } from '@tessera/media';
import type { FollowingFeed } from '@tessera/types';
import { encodeCursor } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { POST_INCLUDE, PostsService } from './posts.service.js';

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

    const high = await highFollowerAuthorIds(this.prisma, allowedAuthors);
    const fanoutAuthors = allowedAuthors.filter((id) => !high.has(id));

    const fanout = await this.prisma.feedEntry.findMany({
      where: {
        userId,
        authorId: { notIn: hiddenAuthors.length ? hiddenAuthors : ['__none__'] },
        OR: [
          { authorId: { in: fanoutAuthors } },
          { post: { visibility: 'circles' } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { postId: 'desc' }],
      take: 200,
      include: { post: { include: POST_INCLUDE } },
    });

    const merged = new Map<string, (typeof fanout)[number]['post']>();
    for (const entry of fanout) {
      if (entry.post.deletedAt || entry.post.takenDownAt || !entry.post.publishedAt || entry.post.archivedAt) continue;
      merged.set(entry.postId, entry.post);
    }

    const extraCircles = await this.prisma.post.findMany({
      where: {
        visibility: 'circles',
        publishedAt: { not: null },
        deletedAt: null,
        takenDownAt: null,
        archivedAt: null,
        authorId: { notIn: hiddenAuthors.length ? hiddenAuthors : ['__none__'] },
        audiences: { some: { circle: { members: { some: { userId } } } } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 80,
      include: POST_INCLUDE,
    });
    for (const post of extraCircles) merged.set(post.id, post);

    if (high.size > 0) {
      const extra = await this.prisma.post.findMany({
        where: {
          authorId: { in: [...high] },
          visibility: { in: ['public', 'followers'] },
          publishedAt: { not: null },
          deletedAt: null,
          takenDownAt: null,
          archivedAt: null,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 80,
        include: POST_INCLUDE,
      });
      for (const post of extra) merged.set(post.id, post);
    }

    const sensitivity = await this.prisma.profile.findUnique({
      where: { userId },
      select: { sensitivityLevel: true },
    });
    const posts = [...merged.values()]
      .filter((post) => {
        if (sensitivity?.sensitivityLevel !== 'hide') return true;
        if (post.authorId === userId) return true;
        return !post.sensitive;
      })
      .sort((a, b) => {
      const ta = b.publishedAt!.getTime() - a.publishedAt!.getTime();
      if (ta !== 0) return ta;
      return b.id.localeCompare(a.id);
    });

    const state = await this.prisma.feedState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const sliced = sliceFollowingFeed({
      posts: posts.map((post) => ({ ...post, publishedAt: post.publishedAt! })),
      caughtUpAt: state.followingCaughtUpAt,
      keepGoing: opts.keepGoing,
      limit: opts.limit,
    });

    if (!opts.keepGoing) {
      await this.prisma.feedState.update({
        where: { userId },
        data: {
          lastVisitAt: new Date(),
          lastVisitNewCount: sliced.finishLine?.seenSinceLastVisit ?? 0,
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
      finishLine: sliced.finishLine,
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

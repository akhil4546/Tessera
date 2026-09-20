import type { TesseraPrisma } from '@tessera/db';
import { FEED_FANOUT_FOLLOWER_THRESHOLD } from '@tessera/types';
import { indexPublishedPost } from './index-documents.ts';

export async function recipientIdsForPost(
  prisma: TesseraPrisma,
  post: { id: string; authorId: string; visibility: 'public' | 'followers' | 'circles' },
): Promise<Set<string>> {
  if (post.visibility === 'circles') {
    const members = await prisma.circleMember.findMany({
      where: { circle: { postAudiences: { some: { postId: post.id } } } },
      select: { userId: true },
    });
    return new Set<string>([post.authorId, ...members.map((row) => row.userId)]);
  }
  const followers = await prisma.follow.findMany({
    where: { followeeId: post.authorId, status: 'accepted' },
    select: { followerId: true },
  });
  return new Set<string>([post.authorId, ...followers.map((row) => row.followerId)]);
}

export async function fanoutPost(prisma: TesseraPrisma, postId: string): Promise<{ wrote: number; skippedHighFollower: boolean }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { author: { include: { profile: true } } },
  });
  if (!post?.publishedAt || post.deletedAt || post.archivedAt) {
    return { wrote: 0, skippedHighFollower: false };
  }

  const followerCount = await prisma.follow.count({
    where: { followeeId: post.authorId, status: 'accepted' },
  });
  // Circle posts always fan out to members — the audience is small and not "all followers".
  if (post.visibility !== 'circles' && followerCount >= FEED_FANOUT_FOLLOWER_THRESHOLD) {
    return { wrote: 0, skippedHighFollower: true };
  }

  const recipientIds = await recipientIdsForPost(prisma, post);

  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: post.authorId }, { blockedId: post.authorId }],
    },
  });
  for (const block of blocks) {
    recipientIds.delete(block.blockerId === post.authorId ? block.blockedId : block.blockerId);
  }

  const mutes = await prisma.mute.findMany({
    where: { mutedId: post.authorId, scope: { in: ['posts', 'both'] } },
    select: { muterId: true },
  });
  for (const mute of mutes) recipientIds.delete(mute.muterId);

  let wrote = 0;
  for (const userId of recipientIds) {
    await prisma.feedEntry.upsert({
      where: { userId_postId: { userId, postId: post.id } },
      create: {
        userId,
        postId: post.id,
        authorId: post.authorId,
        publishedAt: post.publishedAt,
      },
      update: { publishedAt: post.publishedAt },
    });
    wrote += 1;
  }
  return { wrote, skippedHighFollower: false };
}

export async function retractPost(prisma: TesseraPrisma, postId: string): Promise<number> {
  const result = await prisma.feedEntry.deleteMany({ where: { postId } });
  await indexPublishedPost(prisma, postId);
  return result.count;
}

export async function retractAuthorFromViewer(
  prisma: TesseraPrisma,
  viewerId: string,
  authorId: string,
  scope: 'all' | 'non_circles' = 'all',
): Promise<number> {
  const result = await prisma.feedEntry.deleteMany({
    where: {
      userId: viewerId,
      authorId,
      ...(scope === 'non_circles' ? { post: { visibility: { in: ['public', 'followers'] } } } : {}),
    },
  });
  return result.count;
}

export async function backfillAuthorIntoViewer(
  prisma: TesseraPrisma,
  viewerId: string,
  authorId: string,
  limit = 50,
): Promise<number> {
  const posts = await prisma.post.findMany({
    where: {
      authorId,
      publishedAt: { not: null },
      deletedAt: null,
      archivedAt: null,
      visibility: { in: ['public', 'followers'] },
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  let wrote = 0;
  for (const post of posts) {
    if (!post.publishedAt) continue;
    await prisma.feedEntry.upsert({
      where: { userId_postId: { userId: viewerId, postId: post.id } },
      create: {
        userId: viewerId,
        postId: post.id,
        authorId: post.authorId,
        publishedAt: post.publishedAt,
      },
      update: {},
    });
    wrote += 1;
  }
  return wrote;
}

export async function backfillCirclePostsIntoViewer(
  prisma: TesseraPrisma,
  viewerId: string,
  authorId: string,
  limit = 50,
): Promise<number> {
  const posts = await prisma.post.findMany({
    where: {
      authorId,
      visibility: 'circles',
      publishedAt: { not: null },
      deletedAt: null,
      archivedAt: null,
      audiences: { some: { circle: { members: { some: { userId: viewerId } } } } },
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  let wrote = 0;
  for (const post of posts) {
    if (!post.publishedAt) continue;
    await prisma.feedEntry.upsert({
      where: { userId_postId: { userId: viewerId, postId: post.id } },
      create: {
        userId: viewerId,
        postId: post.id,
        authorId: post.authorId,
        publishedAt: post.publishedAt,
      },
      update: {},
    });
    wrote += 1;
  }
  return wrote;
}

export async function retractInaccessibleCirclePosts(
  prisma: TesseraPrisma,
  viewerId: string,
  authorId: string,
): Promise<number> {
  const entries = await prisma.feedEntry.findMany({
    where: { userId: viewerId, authorId, post: { visibility: 'circles' } },
    select: { postId: true },
  });
  let removed = 0;
  for (const entry of entries) {
    const still = await prisma.postAudience.findFirst({
      where: {
        postId: entry.postId,
        circle: { members: { some: { userId: viewerId } } },
      },
    });
    if (still) continue;
    await prisma.feedEntry.deleteMany({ where: { userId: viewerId, postId: entry.postId } });
    removed += 1;
  }
  return removed;
}

export async function highFollowerAuthorIds(
  prisma: TesseraPrisma,
  authorIds: string[],
): Promise<Set<string>> {
  const high = new Set<string>();
  for (const id of authorIds) {
    const count = await prisma.follow.count({ where: { followeeId: id, status: 'accepted' } });
    if (count >= FEED_FANOUT_FOLLOWER_THRESHOLD) high.add(id);
  }
  return high;
}

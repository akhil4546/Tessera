import type { TesseraPrisma } from '@tessera/db';
import { SEARCH_INDEXES, meiliDeleteDocument, meiliIndexDocuments } from './search-index.ts';

export async function indexUserProfile(prisma: TesseraPrisma, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user?.profile || user.deactivatedAt || user.suspendedAt || user.isMinor) {
    await meiliDeleteDocument(SEARCH_INDEXES.people, userId);
    return;
  }
  await meiliIndexDocuments(SEARCH_INDEXES.people, [
    {
      id: user.id,
      handle: user.handle,
      displayName: user.profile.displayName,
      bio: user.profile.bio,
      isPrivate: user.profile.isPrivate,
    },
  ]);
}

export async function indexPublishedPost(prisma: TesseraPrisma, postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { include: { profile: true } },
      hashtags: { include: { hashtag: true } },
      place: true,
    },
  });
  if (!post || post.deletedAt || !post.publishedAt || post.archivedAt || post.takenDownAt) {
    await meiliDeleteDocument(SEARCH_INDEXES.captions, postId);
    return;
  }
  const publicCaption =
    post.visibility === 'public' &&
    !(post.author.profile?.isPrivate ?? false) &&
    !post.author.deactivatedAt &&
    !post.author.suspendedAt &&
    !post.author.isMinor;
  if (!publicCaption) {
    await meiliDeleteDocument(SEARCH_INDEXES.captions, postId);
  } else {
    await meiliIndexDocuments(SEARCH_INDEXES.captions, [
      {
        id: post.id,
        caption: post.caption,
        handle: post.author.handle,
        hashtags: post.hashtags.map((row) => row.hashtag.tag),
      },
    ]);
  }
  for (const row of post.hashtags) {
    const postCount = await prisma.postHashtag.count({
      where: { hashtagId: row.hashtagId, post: { publishedAt: { not: null }, deletedAt: null } },
    });
    await meiliIndexDocuments(SEARCH_INDEXES.hashtags, [{ id: row.hashtag.id, tag: row.hashtag.tag, postCount }]);
  }
  if (post.place) {
    const postCount = await prisma.post.count({
      where: { placeId: post.place.id, publishedAt: { not: null }, deletedAt: null, visibility: 'public' },
    });
    await meiliIndexDocuments(SEARCH_INDEXES.places, [
      {
        id: post.place.id,
        slug: post.place.slug,
        name: post.place.name,
        lat: post.place.lat,
        lng: post.place.lng,
        postCount,
      },
    ]);
  }
  await indexUserProfile(prisma, post.authorId);
}

export async function indexBoard(prisma: TesseraPrisma, boardId: string): Promise<void> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { owner: { include: { profile: true } } },
  });
  if (!board || board.visibility !== 'public' || board.owner.deactivatedAt) {
    await meiliDeleteDocument(SEARCH_INDEXES.boards, boardId);
    return;
  }
  await meiliIndexDocuments(SEARCH_INDEXES.boards, [
    {
      id: board.id,
      title: board.title,
      description: board.description,
      handle: board.owner.handle,
      visibility: board.visibility,
    },
  ]);
}

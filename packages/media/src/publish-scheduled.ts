import { Prisma, type TesseraPrisma } from '@tessera/db';
import { parseCaption } from './caption.ts';
import { fanoutPost } from './fanout.ts';
import { indexPublishedPost } from './index-documents.ts';
import { aggregateKeyFor } from './notifications.ts';

export type PublishScheduledResult = {
  scanned: number;
  published: number;
  waitingOnMedia: number;
  notificationIds: string[];
};

export async function publishDueScheduledPosts(
  prisma: TesseraPrisma,
  now = new Date(),
): Promise<PublishScheduledResult> {
  const due = await prisma.post.findMany({
    where: {
      scheduledAt: { lte: now },
      publishedAt: null,
      deletedAt: null,
      takenDownAt: null,
    },
    include: { media: { include: { peopleTags: true } } },
  });

  let published = 0;
  let waitingOnMedia = 0;
  const notificationIds: string[] = [];

  for (const post of due) {
    if (post.media.length === 0 || post.media.some((item) => item.status !== 'ready' || item.moderationHold)) {
      waitingOnMedia += 1;
      continue;
    }
    await prisma.post.update({
      where: { id: post.id },
      data: { publishedAt: now },
    });
    await fanoutPost(prisma, post.id);
    await indexPublishedPost(prisma, post.id);
    const created = await emitScheduledSideEffects(prisma, {
      id: post.id,
      authorId: post.authorId,
      caption: post.caption,
      media: post.media,
    });
    notificationIds.push(...created);
    published += 1;
  }

  return { scanned: due.length, published, waitingOnMedia, notificationIds };
}

async function emitScheduledSideEffects(
  prisma: TesseraPrisma,
  post: {
    id: string;
    authorId: string;
    caption: string;
    media: { peopleTags: { taggedUserId: string }[] }[];
  },
): Promise<string[]> {
  const ids: string[] = [];
  const live = await upsertKindNotification(prisma, {
    recipientId: post.authorId,
    kind: 'scheduled_post_published',
    targetType: 'post',
    targetId: post.id,
    href: `/p/${post.id}`,
    payload: { postId: post.id },
  });
  if (live) ids.push(live);

  const { mentions } = parseCaption(post.caption);
  if (mentions.length > 0) {
    const mentioned = await prisma.user.findMany({
      where: { handle: { in: mentions.map((handle) => handle.toLowerCase()) } },
      select: { id: true },
    });
    for (const user of mentioned) {
      if (user.id === post.authorId) continue;
      const id = await upsertKindNotification(prisma, {
        recipientId: user.id,
        actorId: post.authorId,
        kind: 'mention',
        targetType: 'post',
        targetId: post.id,
        href: `/p/${post.id}`,
        payload: { postId: post.id },
      });
      if (id) ids.push(id);
    }
  }

  const taggedIds = new Set<string>();
  for (const item of post.media) {
    for (const tag of item.peopleTags) taggedIds.add(tag.taggedUserId);
  }
  for (const taggedId of taggedIds) {
    if (taggedId === post.authorId) continue;
    const id = await upsertKindNotification(prisma, {
      recipientId: taggedId,
      actorId: post.authorId,
      kind: 'tag',
      targetType: 'post',
      targetId: post.id,
      href: `/p/${post.id}`,
      payload: { postId: post.id },
    });
    if (id) ids.push(id);
  }
  return ids;
}

async function upsertKindNotification(
  prisma: TesseraPrisma,
  input: {
    recipientId: string;
    actorId?: string;
    kind: 'scheduled_post_published' | 'mention' | 'tag';
    targetType: string;
    targetId: string;
    href: string;
    payload: Record<string, unknown>;
  },
): Promise<string | null> {
  const aggregateKey = aggregateKeyFor({
    kind: input.kind,
    targetId: input.targetId,
    actorId: input.actorId,
  });
  const existing = await prisma.notification.findUnique({
    where: { recipientId_aggregateKey: { recipientId: input.recipientId, aggregateKey } },
  });
  const actorIds = input.actorId ? [input.actorId] : [];
  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        actorIds,
        actorCount: actorIds.length,
        href: input.href,
        payload: input.payload as Prisma.InputJsonValue,
        readAt: null,
      },
    });
    return existing.id;
  }
  const row = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      kind: input.kind,
      aggregateKey,
      actorIds,
      actorCount: actorIds.length,
      targetType: input.targetType,
      targetId: input.targetId,
      href: input.href,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

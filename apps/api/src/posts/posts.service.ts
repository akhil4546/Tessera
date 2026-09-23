import { Injectable } from '@nestjs/common';
import {
  MAX_HERO_TILES,
  assertAuthenticity,
  backfillAuthorIntoViewer,
  canViewPost,
  isFilterId,
  isScheduledPending,
  mosaicSpan,
  parseCaption,
  parseAdjustments,
  retractAuthorFromViewer,
  retractPost,
} from '@tessera/media';
import type { AppreciationType, MosaicView, PostCard } from '@tessera/types';
import type { CreatePostInput, UpdatePostInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { cursorWherePublished, encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../discovery/search.service.js';
import { upsertPlaceByName } from '../discovery/place-upsert.js';
import { QueueService } from '../queue/queue.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import { toAudioTrackView, toLoopView } from '../loops/loops.mapper.js';
import { assertOwnedCircleIds, parseFutureSchedule, resolveContentAudience, viewerInPostCircles } from '../organisation/audience.js';
import { tallyAppreciations, toPostCard } from './posts.mapper.js';

export const POST_INCLUDE = {
  author: { include: { profile: true } },
  place: true,
  hashtags: { include: { hashtag: true } },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    include: { peopleTags: { include: { taggedUser: { include: { profile: true } } } } },
  },
  appreciations: true,
  loop: {
    include: {
      audioTrack: { include: { owner: { include: { profile: true } } } },
    },
  },
  _count: { select: { comments: { where: { deletedAt: null } } } },
  audiences: { select: { circleId: true } },
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly media: MediaService,
    private readonly queues: QueueService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly search: SearchService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CreatePostInput): Promise<PostCard> {
    const audience = resolveContentAudience(input);
    const circleIds =
      audience.visibility === 'circles' ? await assertOwnedCircleIds(this.prisma, userId, audience.circleIds) : [];
    const scheduledAt = parseFutureSchedule(input.scheduledAt);
    await this.rateLimit.consume(`post:${userId}`, 20, 60 * 60);

    const edits = input.media.map((item) => ({
      filterId: item.filterId,
      adjustments: parseAdjustments(item.adjustments),
    }));
    const authenticity = assertAuthenticity(input.authenticity, edits);
    if (!authenticity.ok) {
      throw new TesseraHttpError(400, authenticity.code, authenticity.message);
    }
    for (const item of input.media) {
      if (!isFilterId(item.filterId)) {
        throw new TesseraHttpError(400, 'VALIDATION', `Unknown filter: ${item.filterId}`);
      }
    }

    const ids = input.media.map((item) => item.id);
    const rows = await this.prisma.mediaItem.findMany({ where: { id: { in: ids }, ownerId: userId } });
    if (rows.length !== ids.length) {
      throw new TesseraHttpError(400, 'MEDIA_NOT_FOUND', 'Every media item must belong to you.');
    }
    for (const row of rows) {
      if (row.purpose !== 'post') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Avatar media cannot be attached to a post.');
      }
      if (row.postId) {
        throw new TesseraHttpError(409, 'MEDIA_IN_USE', 'That media is already on a post.');
      }
    }

    const { hashtags, mentions } = parseCaption(input.caption);
    void mentions;

    const post = await this.prisma.$transaction(async (tx) => {
      const place = await upsertPlaceByName(tx, input.locationName);
      const created = await tx.post.create({
        data: {
          authorId: userId,
          kind: 'post',
          visibility: audience.visibility,
          caption: input.caption,
          locationName: input.locationName ?? null,
          placeId: place?.id ?? null,
          commentsEnabled: input.commentsEnabled,
          publicAppreciationCounts: input.publicAppreciationCounts,
          authenticity: input.authenticity,
          sensitive: input.sensitive ?? false,
          scheduledAt,
        },
      });
      if (circleIds.length > 0) {
        await tx.postAudience.createMany({
          data: circleIds.map((circleId) => ({ postId: created.id, circleId })),
        });
      }
      for (const [index, item] of input.media.entries()) {
        const needsBake =
          item.filterId !== 'none' ||
          Object.values(item.adjustments).some((n) => n !== 0) ||
          item.crop !== 'original';
        await tx.mediaItem.update({
          where: { id: item.id },
          data: {
            postId: created.id,
            sortOrder: index,
            altText: item.altText,
            crop: item.crop,
            filterId: item.filterId,
            adjustments: item.adjustments,
            status: needsBake && rows.find((r) => r.id === item.id)?.status === 'ready' ? 'uploaded' : undefined,
          },
        });
        for (const tag of item.peopleTags) {
          const tagged = await tx.user.findUnique({ where: { handle: tag.handle.toLowerCase() } });
          if (!tagged) continue;
          await tx.peopleTag.upsert({
            where: { mediaId_taggedUserId: { mediaId: item.id, taggedUserId: tagged.id } },
            create: { mediaId: item.id, taggedUserId: tagged.id, x: tag.x, y: tag.y },
            update: { x: tag.x, y: tag.y },
          });
        }
      }
      for (const tag of hashtags) {
        const hashtag = await tx.hashtag.upsert({
          where: { tag },
          create: { tag },
          update: {},
        });
        await tx.postHashtag.create({ data: { postId: created.id, hashtagId: hashtag.id } });
      }
      return created;
    });

    for (const item of input.media) {
      const row = rows.find((r) => r.id === item.id);
      const needsBake =
        item.filterId !== 'none' ||
        Object.values(item.adjustments).some((n) => n !== 0) ||
        item.crop !== 'original' ||
        row?.status !== 'ready';
      if (needsBake) await this.queues.processMedia(item.id);
    }

    await this.publishIfReady(post.id);

    return this.get(post.id, userId);
  }

  async publishIfReady(postId: string): Promise<boolean> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    });
    if (!post || post.deletedAt) return false;
    if (post.media.length === 0) return false;
    if (post.media.some((item) => item.status !== 'ready')) return false;
    if (isScheduledPending(post)) return false;
    const firstPublish = !post.publishedAt;
    if (firstPublish) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { publishedAt: new Date() },
      });
    }
    await this.queues.fanout(postId);
    await this.search.indexPost(postId);
    if (firstPublish) {
      await this.notifyPublished(postId);
      if (post.scheduledAt) {
        await this.notifications.notify({
          recipientId: post.authorId,
          kind: 'scheduled_post_published',
          targetType: 'post',
          targetId: postId,
          payload: { postId },
        });
      }
    }
    return true;
  }

  async listScheduled(userId: string): Promise<{ items: PostCard[] }> {
    const rows = await this.prisma.post.findMany({
      where: {
        authorId: userId,
        scheduledAt: { not: null },
        publishedAt: null,
        deletedAt: null,
      },
      orderBy: { scheduledAt: 'asc' },
      include: POST_INCLUDE,
    });
    const items: PostCard[] = [];
    for (const post of rows) items.push(await this.mapPost(post, userId));
    return { items };
  }

  async get(postId: string, viewerId?: string): Promise<PostCard> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: POST_INCLUDE });
    if (!post || post.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    if (post.takenDownAt && viewerId !== post.authorId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    }
    await this.assertVisible(post, viewerId);
    return this.mapPost(post, viewerId);
  }

  async update(userId: string, postId: string, input: UpdatePostInput): Promise<PostCard> {
    const post = await this.requireAuthor(userId, postId);
    const data: Record<string, unknown> = { editedAt: new Date() };
    if (input.caption !== undefined) data.caption = input.caption;
    if (input.locationName !== undefined) {
      data.locationName = input.locationName;
      const place = await upsertPlaceByName(this.prisma, input.locationName);
      data.placeId = place?.id ?? null;
    }
    if (input.commentsEnabled !== undefined) data.commentsEnabled = input.commentsEnabled;
    if (input.publicAppreciationCounts !== undefined) {
      data.publicAppreciationCounts = input.publicAppreciationCounts;
    }
    if (input.scheduledAt !== undefined) {
      if (post.publishedAt) {
        throw new TesseraHttpError(400, 'ALREADY_PUBLISHED', 'Published posts cannot be rescheduled.');
      }
      data.scheduledAt = input.scheduledAt ? parseFutureSchedule(input.scheduledAt) : null;
    }
    await this.prisma.post.update({ where: { id: post.id }, data });
    if (input.caption !== undefined) {
      await this.prisma.postHashtag.deleteMany({ where: { postId: post.id } });
      const { hashtags } = parseCaption(input.caption);
      for (const tag of hashtags) {
        const hashtag = await this.prisma.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
        await this.prisma.postHashtag.create({ data: { postId: post.id, hashtagId: hashtag.id } });
      }
    }
    if (input.altText) {
      for (const row of input.altText) {
        await this.prisma.mediaItem.updateMany({
          where: { id: row.mediaId, postId: post.id },
          data: { altText: row.altText },
        });
      }
    }
    if (input.peopleTags) {
      for (const group of input.peopleTags) {
        await this.prisma.peopleTag.deleteMany({ where: { mediaId: group.mediaId } });
        for (const tag of group.tags) {
          const tagged = await this.prisma.user.findUnique({ where: { handle: tag.handle.toLowerCase() } });
          if (!tagged) continue;
          await this.prisma.peopleTag.create({
            data: { mediaId: group.mediaId, taggedUserId: tagged.id, x: tag.x, y: tag.y },
          });
          await this.notifications.notify({
            recipientId: tagged.id,
            actorId: userId,
            kind: 'tag',
            targetType: 'post',
            targetId: post.id,
            payload: { postId: post.id },
          });
        }
      }
    }
    return this.get(post.id, userId);
  }

  async remove(userId: string, postId: string): Promise<void> {
    const post = await this.requireAuthor(userId, postId);
    await this.prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
    await this.queues.retract(post.id);
  }

  async archive(userId: string, postId: string): Promise<PostCard> {
    const post = await this.requireAuthor(userId, postId);
    await this.prisma.post.update({
      where: { id: post.id },
      data: { archivedAt: post.archivedAt ? null : new Date() },
    });
    await retractPost(this.prisma, post.id);
    if (!post.archivedAt) {
      /* archived — stay out of feeds */
    } else {
      await this.queues.fanout(post.id);
    }
    return this.get(post.id, userId);
  }

  async appreciate(userId: string, postId: string, kind: AppreciationType): Promise<PostCard> {
    await this.rateLimit.consume(`appreciate:${userId}`, 300, 60 * 60);
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: POST_INCLUDE });
    if (!post || post.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    await this.assertVisible(post, userId);
    await this.prisma.appreciation.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId, kind },
      update: { kind },
    });
    await this.notifications.notify({
      recipientId: post.authorId,
      actorId: userId,
      kind: 'appreciation',
      targetType: 'post',
      targetId: postId,
      payload: { postId, appreciation: kind },
    });
    return this.get(postId, userId);
  }

  async unappreciate(userId: string, postId: string): Promise<PostCard> {
    await this.prisma.appreciation.deleteMany({ where: { userId, postId } });
    return this.get(postId, userId);
  }

  private async notifyPublished(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { include: { peopleTags: true } },
      },
    });
    if (!post) return;
    const { mentions } = parseCaption(post.caption);
    const mentioned = await this.prisma.user.findMany({
      where: { handle: { in: mentions.map((handle) => handle.toLowerCase()) } },
      select: { id: true },
    });
    for (const user of mentioned) {
      await this.notifications.notify({
        recipientId: user.id,
        actorId: post.authorId,
        kind: 'mention',
        targetType: 'post',
        targetId: post.id,
        payload: { postId: post.id },
      });
    }
    const taggedIds = new Set<string>();
    for (const item of post.media) {
      for (const tag of item.peopleTags) taggedIds.add(tag.taggedUserId);
    }
    for (const taggedId of taggedIds) {
      await this.notifications.notify({
        recipientId: taggedId,
        actorId: post.authorId,
        kind: 'tag',
        targetType: 'post',
        targetId: post.id,
        payload: { postId: post.id },
      });
    }
  }

  async setHeroTiles(userId: string, postIds: string[]): Promise<MosaicView> {
    if (postIds.length > MAX_HERO_TILES) {
      throw new TesseraHttpError(400, 'VALIDATION', 'You can pin up to three hero tiles.');
    }
    const unique = [...new Set(postIds)];
    const posts = await this.prisma.post.findMany({
      where: { id: { in: unique }, authorId: userId, deletedAt: null, publishedAt: { not: null } },
    });
    if (posts.length !== unique.length) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Hero tiles must be your published posts.');
    }
    await this.prisma.$transaction([
      this.prisma.heroTile.deleteMany({ where: { userId } }),
      ...unique.map((postId, index) =>
        this.prisma.heroTile.create({ data: { userId, postId, position: index } }),
      ),
    ]);
    const me = await this.users.loadByHandle((await this.prisma.user.findUnique({ where: { id: userId } }))!.handle);
    return this.mosaic(me.handle, userId);
  }

  async mosaic(handle: string, viewerId: string | undefined, cursor?: string, limit = 24): Promise<MosaicView> {
    const user = await this.users.loadByHandle(handle);
    if (viewerId && viewerId !== user.id && (await this.users.isBlockedEitherWay(viewerId, user.id))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const follows =
      viewerId && viewerId !== user.id
        ? await this.prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: user.id } },
          })
        : null;
    const viewerFollows = follows?.status === 'accepted' || viewerId === user.id;
    if (user.profile?.isPrivate && !viewerFollows && viewerId !== user.id) {
      throw new TesseraHttpError(403, 'PRIVATE', 'This account is private.');
    }

    const heroes = await this.prisma.heroTile.findMany({
      where: { userId: user.id },
      orderBy: { position: 'asc' },
      include: { post: { include: POST_INCLUDE } },
    });

    const extra = cursorWherePublished(cursor);
    const rows = await this.prisma.post.findMany({
      where: {
        authorId: user.id,
        deletedAt: null,
        takenDownAt: viewerId === user.id ? undefined : null,
        archivedAt: viewerId === user.id ? undefined : null,
        publishedAt: { not: null },
        id: { notIn: heroes.map((h) => h.postId) },
        ...(extra ?? {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: POST_INCLUDE,
    });
    const slice = rows.slice(0, limit);
    const tiles = [];
    if (!cursor) {
      for (const hero of heroes) {
        if (hero.post.deletedAt || !hero.post.publishedAt) continue;
        try {
          await this.assertVisible(hero.post, viewerId);
        } catch {
          continue;
        }
        const card = await this.mapPost(hero.post, viewerId);
        tiles.push({
          post: card,
          role: 'hero' as const,
          position: hero.position,
          span: mosaicSpan(card.media[0]?.aspect ?? 1, 'hero'),
        });
      }
    }
    for (const post of slice) {
      try {
        await this.assertVisible(post, viewerId);
      } catch {
        continue;
      }
      const card = await this.mapPost(post, viewerId);
      tiles.push({
        post: card,
        role: 'tile' as const,
        position: null,
        span: mosaicSpan(card.media[0]?.aspect ?? 1, 'tile'),
      });
    }
    const last = slice[slice.length - 1];
    return {
      handle: user.handle,
      tiles,
      nextCursor: rows.length > limit && last?.publishedAt ? encodeCursor(last.publishedAt, last.id) : null,
    };
  }

  async mapPost(
    post: {
      id: string;
      caption: string;
      locationName: string | null;
      place?: { id: string; slug: string; name: string; lat: number | null; lng: number | null } | null;
      authenticity: 'unfiltered' | 'edited' | 'ai_generated';
      visibility: 'public' | 'followers' | 'circles';
      commentsEnabled: boolean;
      publicAppreciationCounts: boolean;
      editedAt: Date | null;
      publishedAt: Date | null;
      scheduledAt?: Date | null;
      createdAt: Date;
      kind: 'post' | 'loop';
      sensitive?: boolean;
      takenDownAt?: Date | null;
      authorId: string;
      author: { id: string; handle: string; profile: { displayName: string; avatarKey: string | null } | null };
      hashtags: { hashtag: { tag: string } }[];
      loop?: {
        coverFrameMs: number;
        allowAudioReuse: boolean;
        captionStatus: 'pending' | 'ready' | 'skipped' | 'failed';
        captionError: string | null;
        captionsKey: string | null;
        overlays: unknown;
        clips: unknown;
        audioTrack: {
          id: string;
          title: string;
          durationMs: number;
          allowReuse: boolean;
          useCount: number;
          audioKey: string;
          waveform: unknown;
          sourcePostId: string | null;
          owner: { id: string; handle: string; profile: { displayName: string; avatarKey: string | null } | null };
        } | null;
      } | null;
      media: Array<{
        id: string;
        kind: 'image' | 'video' | 'audio';
        status: 'awaiting_upload' | 'uploaded' | 'processing' | 'ready' | 'failed';
        width: number | null;
        height: number | null;
        aspect: number | null;
        blurhash: string | null;
        altText: string;
        durationMs: number | null;
        crop: 'original' | 'square' | 'portrait' | 'landscape';
        filterId: string;
        adjustments: unknown;
        variants: unknown;
        originalKey: string;
        processingError: string | null;
        peopleTags: { x: number; y: number; taggedUser: { handle: string; profile: { displayName: string } | null } }[];
      }>;
      appreciations: { userId: string; kind: AppreciationType }[];
      _count: { comments: number };
      audiences?: { circleId: string }[];
    },
    viewerId?: string,
  ): Promise<PostCard> {
    const media = await Promise.all(post.media.map((item) => this.media.toView(item)));
    const { mentions } = parseCaption(post.caption);
    let loop = null;
    if (post.loop) {
      const audio = post.loop.audioTrack
        ? toAudioTrackView({
            ...post.loop.audioTrack,
            audioUrl: await this.storage.signGet(post.loop.audioTrack.audioKey),
            ownerAvatarUrl: await this.storage.signGet(post.loop.audioTrack.owner.profile?.avatarKey ?? null),
          })
        : null;
      loop = toLoopView({
        coverFrameMs: post.loop.coverFrameMs,
        allowAudioReuse: post.loop.allowAudioReuse,
        captionStatus: post.loop.captionStatus,
        captionError: post.loop.captionError,
        captionsUrl: await this.storage.signGet(post.loop.captionsKey),
        overlays: post.loop.overlays,
        clips: post.loop.clips,
        audio,
      });
    }
    return toPostCard({
      post,
      media,
      authorAvatarUrl: await this.storage.signGet(post.author.profile?.avatarKey ?? null),
      viewerId,
      mine: (post.appreciations.find((row) => row.userId === viewerId)?.kind ?? null),
      counts: tallyAppreciations(post.appreciations),
      commentCount: post._count.comments,
      mentions,
      loop,
      circleIds: viewerId === post.authorId ? (post.audiences ?? []).map((row) => row.circleId) : [],
    });
  }

  async onFollowAccepted(followerId: string, authorId: string): Promise<void> {
    await backfillAuthorIntoViewer(this.prisma, followerId, authorId);
  }

  async onUnfollow(viewerId: string, authorId: string): Promise<void> {
    await retractAuthorFromViewer(this.prisma, viewerId, authorId, 'non_circles');
  }

  async onUnfollowOrBlock(viewerId: string, authorId: string): Promise<void> {
    await retractAuthorFromViewer(this.prisma, viewerId, authorId);
    await retractAuthorFromViewer(this.prisma, authorId, viewerId);
  }

  private async requireAuthor(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    if (post.authorId !== userId) throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the author can do that.');
    return post;
  }

  private async assertVisible(
    post: {
      authorId: string;
      visibility: 'public' | 'followers' | 'circles';
      publishedAt: Date | null;
      deletedAt: Date | null;
      archivedAt: Date | null;
      takenDownAt?: Date | null;
      author: { profile: { isPrivate: boolean } | null };
      id?: string;
    },
    viewerId?: string,
  ): Promise<void> {
    const blocked = viewerId ? await this.users.isBlockedEitherWay(viewerId, post.authorId) : false;
    const follows = viewerId
      ? await this.prisma.follow.findUnique({
          where: { followerId_followeeId: { followerId: viewerId, followeeId: post.authorId } },
        })
      : null;
    const viewerInAuthorCircle =
      post.visibility === 'circles' && post.id
        ? await viewerInPostCircles(this.prisma, post.id, viewerId)
        : false;
    const ok = canViewPost({
      authorId: post.authorId,
      viewerId,
      visibility: post.visibility,
      authorPrivate: post.author.profile?.isPrivate ?? false,
      viewerInAuthorCircle,
      viewerFollowsAuthor: follows?.status === 'accepted' || viewerId === post.authorId,
      blockedEitherWay: blocked,
      published: Boolean(post.publishedAt),
      deleted: Boolean(post.deletedAt),
      archived: Boolean(post.archivedAt),
      takenDown: Boolean(post.takenDownAt),
    });
    if (!ok) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
  }
}

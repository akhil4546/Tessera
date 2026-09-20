import { Injectable } from '@nestjs/common';
import {
  assertAuthenticity,
  assertLoopDuration,
  BUDGET_EXTEND_MINUTES,
  canViewPost,
  composedDurationMs,
  parseCaption,
  sameUtcDay,
  utcDay,
  sessionWellbeingState,
  wellbeingState,
} from '@tessera/media';
import type { AudioTrackView, LoopsFeed, Paginated, PostCard, WellbeingView } from '@tessera/types';
import type { CreateLoopInput, UpdateLoopInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { assertOwnedCircleIds, parseFutureSchedule, resolveContentAudience } from '../organisation/audience.js';
import { upsertPlaceByName } from '../discovery/place-upsert.js';
import { cursorWherePublished, encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { POST_INCLUDE, PostsService } from '../posts/posts.service.js';
import { QueueService } from '../queue/queue.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import { toAudioTrackView } from './loops.mapper.js';

@Injectable()
export class LoopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly users: UsersService,
    private readonly queues: QueueService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async create(userId: string, input: CreateLoopInput, idempotencyKey?: string): Promise<PostCard> {
    const audience = resolveContentAudience(input);
    const circleIds =
      audience.visibility === 'circles' ? await assertOwnedCircleIds(this.prisma, userId, audience.circleIds) : [];
    const scheduledAt = parseFutureSchedule(input.scheduledAt);
    await this.rateLimit.consume(`loop:${userId}`, 20, 60 * 60);

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_key_route: { userId, key: idempotencyKey, route: 'POST /v1/loops' } },
      });
      if (existing) return this.get(String(existing.body), userId);
    }

    const ids = input.clips.map((clip) => clip.mediaId);
    if (new Set(ids).size !== ids.length) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Each clip needs its own media.');
    }
    const rows = await this.prisma.mediaItem.findMany({ where: { id: { in: ids }, ownerId: userId } });
    if (rows.length !== ids.length) {
      throw new TesseraHttpError(400, 'MEDIA_NOT_FOUND', 'Every clip must belong to you.');
    }
    for (const clip of input.clips) {
      const row = rows.find((item) => item.id === clip.mediaId)!;
      if (row.purpose !== 'loop') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Upload Loop clips with purpose=loop, not a post photo.');
      }
      if (row.kind !== 'video') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Loops are video only.');
      }
      if (row.postId) {
        throw new TesseraHttpError(409, 'MEDIA_IN_USE', 'That media is already on a post.');
      }
      const duration = row.durationMs ?? clip.trimEndMs;
      if (clip.trimEndMs > duration + 50) {
        throw new TesseraHttpError(400, 'VALIDATION', 'Clip trim is longer than the source.');
      }
    }
    const durationCheck = assertLoopDuration(composedDurationMs(input.clips));
    if (!durationCheck.ok) {
      throw new TesseraHttpError(400, durationCheck.code, durationCheck.message);
    }

    const authenticity = assertAuthenticity(input.authenticity, []);
    if (!authenticity.ok) {
      throw new TesseraHttpError(400, authenticity.code, authenticity.message);
    }

    if (input.audioTrackId) {
      await this.assertReusableAudio(userId, input.audioTrackId);
    }

    const { hashtags } = parseCaption(input.caption);
    const first = input.clips[0]!;
    const post = await this.prisma.$transaction(async (tx) => {
      const place = await upsertPlaceByName(tx, input.locationName);
      const created = await tx.post.create({
        data: {
          authorId: userId,
          kind: 'loop',
          visibility: audience.visibility,
          caption: input.caption,
          locationName: input.locationName ?? null,
          placeId: place?.id ?? null,
          commentsEnabled: input.commentsEnabled,
          publicAppreciationCounts: input.publicAppreciationCounts,
          authenticity: input.authenticity,
          scheduledAt,
        },
      });
      if (circleIds.length > 0) {
        await tx.postAudience.createMany({
          data: circleIds.map((circleId) => ({ postId: created.id, circleId })),
        });
      }
      await tx.mediaItem.update({
        where: { id: first.mediaId },
        data: {
          postId: created.id,
          sortOrder: 0,
          altText: input.altText,
          status: 'uploaded',
        },
      });
      await tx.loop.create({
        data: {
          postId: created.id,
          coverFrameMs: input.coverFrameMs,
          allowAudioReuse: input.allowAudioReuse,
          audioTrackId: input.audioTrackId ?? null,
          captionStatus: 'pending',
          overlays: input.overlays,
          clips: input.clips,
        },
      });
      for (const tag of hashtags) {
        const hashtag = await tx.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
        await tx.postHashtag.create({ data: { postId: created.id, hashtagId: hashtag.id } });
      }
      return created;
    });

    await this.queues.processLoop(post.id);

    if (idempotencyKey) {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key: idempotencyKey,
          route: 'POST /v1/loops',
          status: 201,
          body: post.id,
        },
      });
    }

    return this.get(post.id, userId);
  }

  async get(postId: string, viewerId?: string): Promise<PostCard> {
    const card = await this.posts.get(postId, viewerId);
    if (card.kind !== 'loop') throw new TesseraHttpError(404, 'NOT_FOUND', 'Loop not found.');
    return card;
  }

  async update(userId: string, postId: string, input: UpdateLoopInput): Promise<PostCard> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { loop: true } });
    if (!post || post.deletedAt || post.kind !== 'loop' || !post.loop) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Loop not found.');
    }
    if (post.authorId !== userId) throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the author can do that.');
    await this.prisma.loop.update({
      where: { postId },
      data: {
        allowAudioReuse: input.allowAudioReuse,
        coverFrameMs: input.coverFrameMs,
      },
    });
    if (input.allowAudioReuse !== undefined) {
      await this.prisma.audioTrack.updateMany({
        where: { sourcePostId: postId },
        data: { allowReuse: input.allowAudioReuse },
      });
    }
    return this.get(postId, userId);
  }

  async feed(userId: string, opts: { cursor?: string; limit: number }): Promise<LoopsFeed> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followeeId: true },
    });
    const authorIds = [userId, ...follows.map((row) => row.followeeId)];
    const extra = cursorWherePublished(opts.cursor);
    const rows = await this.prisma.post.findMany({
      where: {
        kind: 'loop',
        deletedAt: null,
        archivedAt: null,
        publishedAt: { not: null },
        OR: [
          { authorId: { in: authorIds } },
          { visibility: 'circles', audiences: { some: { circle: { members: { some: { userId } } } } } },
        ],
        ...(extra ?? {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      include: POST_INCLUDE,
    });
    const slice = rows.slice(0, opts.limit);
    const items: PostCard[] = [];
    for (const post of slice) {
      try {
        items.push(await this.posts.mapPost(post, userId));
      } catch {
        /* hidden by visibility */
      }
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > opts.limit && last?.publishedAt ? encodeCursor(last.publishedAt, last.id) : null,
      wellbeing: await this.wellbeing(userId),
    };
  }

  async watch(userId: string, postId: string, seconds: number): Promise<WellbeingView> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.kind !== 'loop' || post.deletedAt) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Loop not found.');
    }
    await this.get(postId, userId);
    const day = utcDay();
    await this.prisma.watchTimeLog.create({
      data: { userId, postId, seconds, day },
    });
    return this.wellbeing(userId);
  }

  async wellbeing(userId: string): Promise<WellbeingView> {
    const setting = await this.ensureSetting(userId);
    const day = utcDay();
    const watched = await this.prisma.watchTimeLog.aggregate({
      where: { userId, day },
      _sum: { seconds: true },
    });
    const app = await this.prisma.appTimeLog.aggregate({
      where: { userId, day },
      _sum: { seconds: true },
    });
    const loops = wellbeingState({
      loopsBudgetMinutes: setting.loopsBudgetMinutes,
      loopsBonusMinutes: setting.loopsBonusMinutes,
      loopsBonusOn: setting.loopsBonusOn,
      loopsDismissedOn: setting.loopsDismissedOn,
      watchedSecondsToday: watched._sum.seconds ?? 0,
    });
    const session = sessionWellbeingState({
      dailyReminderMinutes: setting.dailyReminderMinutes,
      sessionNudgeMinutes: setting.sessionNudgeMinutes,
      lastBreakNudgeAt: setting.lastBreakNudgeAt,
      sessionStartedAt: setting.sessionStartedAt,
      appSecondsToday: app._sum.seconds ?? 0,
    });
    return { ...loops, ...session };
  }

  async setBudget(
    userId: string,
    input: {
      loopsBudgetMinutes?: number | null;
      dailyReminderMinutes?: number | null;
      sessionNudgeMinutes?: number | null;
    },
  ): Promise<WellbeingView> {
    await this.ensureSetting(userId);
    await this.prisma.wellbeingSetting.update({
      where: { userId },
      data: {
        ...(input.loopsBudgetMinutes !== undefined ? { loopsBudgetMinutes: input.loopsBudgetMinutes } : {}),
        ...(input.dailyReminderMinutes !== undefined ? { dailyReminderMinutes: input.dailyReminderMinutes } : {}),
        ...(input.sessionNudgeMinutes !== undefined ? { sessionNudgeMinutes: input.sessionNudgeMinutes } : {}),
      },
    });
    return this.wellbeing(userId);
  }

  async extendBudget(userId: string): Promise<WellbeingView> {
    const setting = await this.ensureSetting(userId);
    const today = utcDay();
    const bonus = sameUtcDay(setting.loopsBonusOn)
      ? setting.loopsBonusMinutes + BUDGET_EXTEND_MINUTES
      : BUDGET_EXTEND_MINUTES;
    await this.prisma.wellbeingSetting.update({
      where: { userId },
      data: { loopsBonusMinutes: bonus, loopsBonusOn: today, loopsDismissedOn: null },
    });
    return this.wellbeing(userId);
  }

  async dismissBudget(userId: string): Promise<WellbeingView> {
    await this.ensureSetting(userId);
    await this.prisma.wellbeingSetting.update({
      where: { userId },
      data: { loopsDismissedOn: utcDay() },
    });
    return this.wellbeing(userId);
  }

  async listAudio(
    userId: string,
    opts: { cursor?: string; limit: number; q?: string },
  ): Promise<Paginated<AudioTrackView>> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followeeId: true },
    });
    const ownerIds = [userId, ...follows.map((row) => row.followeeId)];
    const rows = await this.prisma.audioTrack.findMany({
      where: {
        ownerId: { in: ownerIds },
        allowReuse: true,
        ...(opts.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      include: { owner: { include: { profile: true } } },
    });
    const slice = rows.slice(0, opts.limit);
    const items: AudioTrackView[] = [];
    for (const row of slice) {
      items.push(
        toAudioTrackView({
          ...row,
          audioUrl: await this.storage.signGet(row.audioKey),
          ownerAvatarUrl: await this.storage.signGet(row.owner.profile?.avatarKey ?? null),
        }),
      );
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > opts.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }



  private async ensureSetting(userId: string) {
    return this.prisma.wellbeingSetting.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private async assertReusableAudio(viewerId: string, audioTrackId: string): Promise<void> {
    const track = await this.prisma.audioTrack.findUnique({
      where: { id: audioTrackId },
      include: { sourcePost: { include: { author: { include: { profile: true } } } } },
    });
    if (!track) throw new TesseraHttpError(404, 'NOT_FOUND', 'That original audio is gone.');
    if (!track.allowReuse && track.ownerId !== viewerId) {
      throw new TesseraHttpError(403, 'AUDIO_NOT_REUSABLE', 'The creator turned off audio reuse.');
    }
    if (track.ownerId === viewerId) return;
    const source = track.sourcePost;
    if (!source || source.deletedAt) return;
    const blocked = await this.users.isBlockedEitherWay(viewerId, source.authorId);
    const follows = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: source.authorId } },
    });
    const ok = canViewPost({
      authorId: source.authorId,
      viewerId,
      visibility: source.visibility,
      authorPrivate: source.author.profile?.isPrivate ?? false,
      viewerFollowsAuthor: follows?.status === 'accepted',
      blockedEitherWay: blocked,
      published: Boolean(source.publishedAt),
      deleted: Boolean(source.deletedAt),
      archived: Boolean(source.archivedAt),
    });
    if (!ok) throw new TesseraHttpError(404, 'NOT_FOUND', 'That original audio is gone.');
  }
}

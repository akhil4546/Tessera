import { Injectable } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import {
  MAX_MOMENT_VIDEO_DURATION_MS,
  canKeepMoment,
  canViewMoment,
  clampStillDuration,
  expireMoments,
  INTERACTION_WINDOW_MS,
  linkStickerAllowed,
  MAX_REEL_SHELVES,
  MAX_SHELF_ITEMS,
  momentExpiresAt,
  muteHidesMoments,
  orderMomentTray,
  trayInteractionBoostMs,
} from '@tessera/media';
import type {
  MomentAuthorReel,
  MomentCard,
  MomentTray,
  MomentViewerRow,
  ReelShelfCard,
  ReelShelfDetail,
} from '@tessera/types';
import type { CreateMomentInput, KeepMomentInput, MomentStickerInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import {
  assertOwnedCircleIds,
  resolveContentAudience,
  viewerInMomentCircles,
} from '../organisation/audience.js';
import { RateLimitService } from '../common/rate-limit.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import {
  authorPreview,
  normalizeHashtag,
  stickerPayload,
  toMomentCard,
  toSegmentView,
  toShelfCard,
} from './moments.mapper.js';

const SEGMENT_INCLUDE = {
  media: { include: { peopleTags: { include: { taggedUser: { include: { profile: true } } } } } },
  stickers: { include: { responses: true } },
  views: true,
  reactions: true,
} as const;

const MOMENT_INCLUDE = {
  author: { include: { profile: true } },
  segments: { orderBy: { sortOrder: 'asc' as const }, include: SEGMENT_INCLUDE },
  shelfItems: true,
  audiences: { select: { circleId: true } },
} as const;

@Injectable()
export class MomentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CreateMomentInput, idempotencyKey?: string): Promise<MomentCard> {
    const audience = resolveContentAudience(input);
    const circleIds =
      audience.visibility === 'circles' ? await assertOwnedCircleIds(this.prisma, userId, audience.circleIds) : [];
    await this.rateLimit.consume(`moment:${userId}`, 30, 60 * 60);

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_key_route: { userId, key: idempotencyKey, route: 'POST /v1/moments' } },
      });
      if (existing) return this.get(String(existing.body), userId);
    }

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

    const mediaIds = input.segments.map((segment) => segment.mediaId);
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Each segment needs its own media.');
    }
    const rows = await this.prisma.mediaItem.findMany({ where: { id: { in: mediaIds }, ownerId: userId } });
    if (rows.length !== mediaIds.length) {
      throw new TesseraHttpError(400, 'MEDIA_NOT_FOUND', 'Every media item must belong to you.');
    }
    for (const row of rows) {
      if (row.purpose !== 'moment') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Attach media uploaded as a Moment, not a post or avatar.');
      }
      if (row.postId) {
        throw new TesseraHttpError(409, 'MEDIA_IN_USE', 'That media is already on a post.');
      }
      if (row.kind === 'video' && row.durationMs && row.durationMs > MAX_MOMENT_VIDEO_DURATION_MS) {
        throw new TesseraHttpError(400, 'VIDEO_TOO_LONG', 'Moment videos can be 30 seconds at most.');
      }
    }
    const inUse = await this.prisma.momentSegment.count({ where: { mediaId: { in: mediaIds } } });
    if (inUse > 0) {
      throw new TesseraHttpError(409, 'MEDIA_IN_USE', 'That media is already on a Moment.');
    }

    for (const segment of input.segments) {
      for (const sticker of segment.stickers) {
        await this.assertSticker(userId, profile.accountType, sticker);
      }
    }

    const moment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moment.create({
        data: { authorId: userId, visibility: audience.visibility },
      });
      if (circleIds.length > 0) {
        await tx.momentAudience.createMany({
          data: circleIds.map((circleId) => ({ momentId: created.id, circleId })),
        });
      }
      for (const [index, segment] of input.segments.entries()) {
        const mediaRow = rows.find((row) => row.id === segment.mediaId)!;
        const durationMs =
          mediaRow.kind === 'video'
            ? Math.min(mediaRow.durationMs ?? MAX_MOMENT_VIDEO_DURATION_MS, MAX_MOMENT_VIDEO_DURATION_MS)
            : clampStillDuration(segment.durationMs);
        const row = await tx.momentSegment.create({
          data: {
            momentId: created.id,
            mediaId: segment.mediaId,
            sortOrder: index,
            durationMs,
          },
        });
        if (segment.altText) {
          await tx.mediaItem.update({ where: { id: segment.mediaId }, data: { altText: segment.altText } });
        }
        for (const sticker of segment.stickers) {
          await tx.momentSticker.create({
            data: {
              segmentId: row.id,
              kind: sticker.kind,
              x: sticker.x,
              y: sticker.y,
              rotation: sticker.rotation,
              scale: sticker.scale,
              payload: this.persistPayload(sticker) as Prisma.InputJsonValue,
            },
          });
        }
      }
      return created;
    });

    await this.publishIfReady(moment.id);

    if (idempotencyKey) {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key: idempotencyKey,
          route: 'POST /v1/moments',
          status: 201,
          body: moment.id,
        },
      });
    }

    return this.get(moment.id, userId);
  }

  async publishIfReady(momentId: string): Promise<boolean> {
    const moment = await this.prisma.moment.findUnique({
      where: { id: momentId },
      include: { segments: { include: { media: true } } },
    });
    if (!moment || moment.deletedAt || moment.publishedAt) return Boolean(moment?.publishedAt);
    if (moment.segments.length === 0) return false;
    if (moment.segments.some((segment) => segment.media.status !== 'ready')) return false;
    const publishedAt = new Date();
    await this.prisma.moment.update({
      where: { id: momentId },
      data: { publishedAt, expiresAt: momentExpiresAt(publishedAt) },
    });
    await this.notifyMomentMentions(momentId, moment.authorId);
    return true;
  }

  async get(momentId: string, viewerId?: string, opts?: { keptVisible?: boolean }): Promise<MomentCard> {
    const moment = await this.prisma.moment.findUnique({ where: { id: momentId }, include: MOMENT_INCLUDE });
    if (!moment || moment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    if (moment.takenDownAt && viewerId !== moment.authorId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    }
    await this.assertVisible(moment, viewerId, opts?.keptVisible ?? false);
    return this.mapMoment(moment, viewerId);
  }

  async remove(userId: string, momentId: string): Promise<void> {
    const moment = await this.requireAuthor(userId, momentId);
    await this.prisma.moment.update({ where: { id: moment.id }, data: { deletedAt: new Date() } });
  }

  async tray(viewerId: string): Promise<MomentTray> {
    await expireMoments(this.prisma, this.storage.inner);
    const now = new Date();
    const since = new Date(now.getTime() - INTERACTION_WINDOW_MS);

    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId, status: 'accepted' },
      select: { followeeId: true },
    });
    const circleAuthors = await this.prisma.momentAudience.findMany({
      where: {
        circle: { members: { some: { userId: viewerId } } },
        moment: { deletedAt: null, expiredAt: null, publishedAt: { not: null } },
      },
      select: { moment: { select: { authorId: true } } },
    });
    const authorIds = [
      viewerId,
      ...follows.map((row) => row.followeeId),
      ...circleAuthors.map((row) => row.moment.authorId),
    ];

    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    });
    const blocked = new Set(
      blocks.map((row) => (row.blockerId === viewerId ? row.blockedId : row.blockerId)),
    );

    const mutes = await this.prisma.mute.findMany({ where: { muterId: viewerId } });
    const mutedAuthors = new Set(
      mutes.filter((row) => muteHidesMoments(row.scope)).map((row) => row.mutedId),
    );

    const moments = await this.prisma.moment.findMany({
      where: {
        authorId: { in: authorIds },
        deletedAt: null,
        takenDownAt: null,
        expiredAt: null,
        publishedAt: { not: null },
        expiresAt: { gt: now },
      },
      include: MOMENT_INCLUDE,
      orderBy: { publishedAt: 'desc' },
    });

    const grouped = new Map<string, typeof moments>();
    for (const moment of moments) {
      if (blocked.has(moment.authorId) && moment.authorId !== viewerId) continue;
      if (mutedAuthors.has(moment.authorId) && moment.authorId !== viewerId) continue;
      if (!(await this.visibleQuiet(moment, viewerId, false))) continue;
      const list = grouped.get(moment.authorId) ?? [];
      list.push(moment);
      grouped.set(moment.authorId, list);
    }

    const authorList = [...grouped.keys()];
    const appreciated = new Set(
      (
        await this.prisma.appreciation.findMany({
          where: { userId: viewerId, createdAt: { gte: since }, post: { authorId: { in: authorList } } },
          select: { post: { select: { authorId: true } } },
        })
      ).map((row) => row.post.authorId),
    );
    const commented = new Set(
      (
        await this.prisma.comment.findMany({
          where: { authorId: viewerId, createdAt: { gte: since }, post: { authorId: { in: authorList } } },
          select: { post: { select: { authorId: true } } },
        })
      ).map((row) => row.post.authorId),
    );
    const viewed = new Set(
      (
        await this.prisma.momentView.findMany({
          where: { viewerId, viewedAt: { gte: since }, moment: { authorId: { in: authorList } } },
          select: { moment: { select: { authorId: true } } },
        })
      ).map((row) => row.moment.authorId),
    );

    const sortable = [];
    for (const [authorId, list] of grouped) {
      const latest = list[0]!;
      const allSegments = list.flatMap((moment) => moment.segments);
      const unseenCount = allSegments.filter(
        (segment) => !segment.views.some((view) => view.viewerId === viewerId),
      ).length;
      sortable.push({
        authorId,
        isSelf: authorId === viewerId,
        unseen: unseenCount > 0 && authorId !== viewerId,
        latestAt: latest.publishedAt?.getTime() ?? 0,
        interactionBoostMs: trayInteractionBoostMs({
          appreciatedRecently: appreciated.has(authorId),
          commentedRecently: commented.has(authorId),
          viewedMomentsRecently: viewed.has(authorId),
        }),
        list,
        unseenCount,
        latest,
      });
    }

    const rings = [];
    for (const row of orderMomentTray(sortable)) {
      const previewMedia = row.latest.segments[0]?.media;
      rings.push({
        author: authorPreview(row.latest.author, await this.storage.signGet(row.latest.author.profile?.avatarKey ?? null)),
        latestAt: row.latest.publishedAt?.toISOString() ?? row.latest.createdAt.toISOString(),
        unseenCount: row.unseenCount,
        segmentCount: row.list.reduce((sum, moment) => sum + moment.segments.length, 0),
        preview: previewMedia ? await this.media.toView(previewMedia) : null,
        isSelf: row.isSelf,
        momentIds: row.list.map((moment) => moment.id),
      });
    }

    return { rings };
  }

  async authorReel(handle: string, viewerId?: string): Promise<MomentAuthorReel> {
    await expireMoments(this.prisma, this.storage.inner);
    const user = await this.users.loadByHandle(handle);
    if (viewerId && viewerId !== user.id && (await this.users.isBlockedEitherWay(viewerId, user.id))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const now = new Date();
    const moments = await this.prisma.moment.findMany({
      where: {
        authorId: user.id,
        deletedAt: null,
        expiredAt: null,
        publishedAt: { not: null },
        expiresAt: { gt: now },
      },
      include: MOMENT_INCLUDE,
      orderBy: { publishedAt: 'asc' },
    });
    const cards: MomentCard[] = [];
    for (const moment of moments) {
      if (!(await this.visibleQuiet(moment, viewerId, false))) continue;
      cards.push(await this.mapMoment(moment, viewerId));
    }
    return {
      author: authorPreview(user, await this.storage.signGet(user.profile?.avatarKey ?? null)),
      moments: cards,
      nextCursor: null,
    };
  }

  async archive(userId: string): Promise<{ items: MomentCard[] }> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile?.momentArchiveEnabled) {
      return { items: [] };
    }
    const rows = await this.prisma.moment.findMany({
      where: { authorId: userId, deletedAt: null, expiredAt: { not: null } },
      include: MOMENT_INCLUDE,
      orderBy: { expiredAt: 'desc' },
      take: 50,
    });
    const items = [];
    for (const moment of rows) {
      items.push(await this.mapMoment(moment, userId));
    }
    return { items };
  }

  async markViewed(userId: string, momentId: string, segmentId: string): Promise<MomentCard> {
    const moment = await this.requireVisible(momentId, userId);
    const segment = moment.segments.find((row) => row.id === segmentId);
    if (!segment) throw new TesseraHttpError(404, 'NOT_FOUND', 'Segment not found.');
    await this.prisma.momentView.upsert({
      where: { segmentId_viewerId: { segmentId, viewerId: userId } },
      create: { momentId, segmentId, viewerId: userId },
      update: { viewedAt: new Date() },
    });
    return this.get(momentId, userId);
  }

  async react(userId: string, momentId: string, segmentId: string, emoji: string): Promise<MomentCard> {
    await this.rateLimit.consume(`moment-react:${userId}`, 200, 60 * 60);
    const moment = await this.requireVisible(momentId, userId);
    const segment = moment.segments.find((row) => row.id === segmentId);
    if (!segment) throw new TesseraHttpError(404, 'NOT_FOUND', 'Segment not found.');
    await this.prisma.momentReaction.upsert({
      where: { segmentId_userId: { segmentId, userId } },
      create: { momentId, segmentId, userId, emoji },
      update: { emoji },
    });
    await this.notifications.notify({
      recipientId: moment.authorId,
      actorId: userId,
      kind: 'moment_reaction',
      targetType: 'moment',
      targetId: momentId,
      payload: { momentId, segmentId, emoji },
    });
    return this.get(momentId, userId);
  }

  async unreact(userId: string, momentId: string, segmentId: string): Promise<MomentCard> {
    await this.requireVisible(momentId, userId);
    await this.prisma.momentReaction.deleteMany({ where: { segmentId, userId } });
    return this.get(momentId, userId);
  }

  async viewers(userId: string, momentId: string): Promise<{ items: MomentViewerRow[] }> {
    const moment = await this.requireAuthor(userId, momentId);
    const views = await this.prisma.momentView.findMany({
      where: { momentId: moment.id },
      include: { viewer: { include: { profile: true } } },
      orderBy: { viewedAt: 'desc' },
    });
    const latest = new Map<string, (typeof views)[number]>();
    for (const row of views) {
      if (!latest.has(row.viewerId)) latest.set(row.viewerId, row);
    }
    const reactions = await this.prisma.momentReaction.findMany({ where: { momentId: moment.id } });
    const reactionByUser = new Map<string, string>();
    for (const row of reactions) reactionByUser.set(row.userId, row.emoji);

    const items: MomentViewerRow[] = [];
    for (const row of latest.values()) {
      items.push({
        viewer: authorPreview(row.viewer, await this.storage.signGet(row.viewer.profile?.avatarKey ?? null)),
        viewedAt: row.viewedAt.toISOString(),
        lastSegmentId: row.segmentId,
        reaction: reactionByUser.get(row.viewerId) ?? null,
      });
    }
    return { items };
  }

  async respond(
    userId: string,
    momentId: string,
    stickerId: string,
    payload: { optionIndex?: number; text?: string },
  ): Promise<MomentCard> {
    const moment = await this.requireVisible(momentId, userId);
    const sticker = moment.segments.flatMap((segment) => segment.stickers).find((row) => row.id === stickerId);
    if (!sticker) throw new TesseraHttpError(404, 'NOT_FOUND', 'Sticker not found.');
    if (sticker.kind === 'poll') {
      const options = Array.isArray(stickerPayload(sticker.payload).options)
        ? (stickerPayload(sticker.payload).options as unknown[])
        : [];
      if (payload.optionIndex == null || payload.optionIndex >= options.length) {
        throw new TesseraHttpError(400, 'VALIDATION', 'Pick one of the poll options.');
      }
      await this.prisma.momentStickerResponse.upsert({
        where: { stickerId_userId: { stickerId, userId } },
        create: { stickerId, userId, payload: { optionIndex: payload.optionIndex } as Prisma.InputJsonValue },
        update: { payload: { optionIndex: payload.optionIndex } as Prisma.InputJsonValue },
      });
    } else if (sticker.kind === 'question') {
      if (!payload.text?.trim()) {
        throw new TesseraHttpError(400, 'VALIDATION', 'Write an answer.');
      }
      await this.prisma.momentStickerResponse.upsert({
        where: { stickerId_userId: { stickerId, userId } },
        create: { stickerId, userId, payload: { text: payload.text.trim() } as Prisma.InputJsonValue },
        update: { payload: { text: payload.text.trim() } as Prisma.InputJsonValue },
      });
    } else {
      throw new TesseraHttpError(400, 'VALIDATION', 'That sticker does not take a response.');
    }
    return this.get(momentId, userId);
  }

  async keep(userId: string, momentId: string, input: KeepMomentInput): Promise<ReelShelfDetail> {
    const moment = await this.requireAuthor(userId, momentId);
    if (
      !canKeepMoment({
        publishedAt: moment.publishedAt,
        expiresAt: moment.expiresAt,
        expiredAt: moment.expiredAt,
        deletedAt: moment.deletedAt,
      })
    ) {
      throw new TesseraHttpError(409, 'MOMENT_EXPIRED', 'Keep a Moment before it disappears.');
    }

    let shelf =
      input.shelfId
        ? await this.prisma.reelShelf.findFirst({ where: { id: input.shelfId, userId } })
        : null;
    if (input.shelfId && !shelf) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Reel Shelf not found.');
    }
    if (!shelf) {
      const count = await this.prisma.reelShelf.count({ where: { userId } });
      if (count >= MAX_REEL_SHELVES) {
        throw new TesseraHttpError(400, 'VALIDATION', `You can have ${MAX_REEL_SHELVES} Reel Shelves.`);
      }
      const coverMediaId = moment.segments[0]?.mediaId ?? null;
      shelf = await this.prisma.reelShelf.create({
        data: { userId, title: input.title!, sortOrder: count, coverMediaId },
      });
    }

    const items = await this.prisma.reelShelfItem.count({ where: { shelfId: shelf.id } });
    if (items >= MAX_SHELF_ITEMS) {
      throw new TesseraHttpError(400, 'VALIDATION', 'This Reel Shelf is full.');
    }
    await this.prisma.reelShelfItem.upsert({
      where: { shelfId_momentId: { shelfId: shelf.id, momentId } },
      create: { shelfId: shelf.id, momentId, sortOrder: items },
      update: {},
    });
    if (!shelf.coverMediaId && moment.segments[0]?.mediaId) {
      await this.prisma.reelShelf.update({
        where: { id: shelf.id },
        data: { coverMediaId: moment.segments[0].mediaId },
      });
    }
    return this.shelfDetail(userId, shelf.id, userId);
  }

  replyNotReady(): never {
    throw new TesseraHttpError(
      501,
      'MESSAGING_NOT_READY',
      'Moment replies go through DMs in Phase 6. Quick emoji reactions work now.',
    );
  }

  async createShelf(userId: string, title: string): Promise<ReelShelfCard> {
    const count = await this.prisma.reelShelf.count({ where: { userId } });
    if (count >= MAX_REEL_SHELVES) {
      throw new TesseraHttpError(400, 'VALIDATION', `You can have ${MAX_REEL_SHELVES} Reel Shelves.`);
    }
    const shelf = await this.prisma.reelShelf.create({
      data: { userId, title, sortOrder: count },
    });
    return toShelfCard(shelf, 0, null);
  }

  async listMyShelves(userId: string): Promise<{ items: ReelShelfCard[] }> {
    return this.listShelvesFor(userId, userId);
  }

  async listPublicShelves(handle: string, viewerId?: string): Promise<{ items: ReelShelfCard[] }> {
    const user = await this.users.loadByHandle(handle);
    await this.assertCanSeeProfile(user.id, viewerId, user.profile?.isPrivate ?? false);
    return this.listShelvesFor(user.id, viewerId);
  }

  async updateShelf(
    userId: string,
    shelfId: string,
    input: { title?: string; coverMediaId?: string | null; sortOrder?: number },
  ): Promise<ReelShelfCard> {
    const shelf = await this.prisma.reelShelf.findFirst({ where: { id: shelfId, userId } });
    if (!shelf) throw new TesseraHttpError(404, 'NOT_FOUND', 'Reel Shelf not found.');
    if (input.coverMediaId) {
      const item = await this.prisma.reelShelfItem.findFirst({
        where: { shelfId, moment: { segments: { some: { mediaId: input.coverMediaId } } } },
      });
      if (!item) {
        throw new TesseraHttpError(400, 'VALIDATION', 'Cover media must come from a Kept Moment on this shelf.');
      }
    }
    const updated = await this.prisma.reelShelf.update({
      where: { id: shelfId },
      data: {
        title: input.title,
        coverMediaId: input.coverMediaId === undefined ? undefined : input.coverMediaId,
        sortOrder: input.sortOrder,
      },
    });
    const itemCount = await this.prisma.reelShelfItem.count({ where: { shelfId } });
    const cover = updated.coverMediaId
      ? await this.media.toView(await this.prisma.mediaItem.findUniqueOrThrow({ where: { id: updated.coverMediaId } }))
      : null;
    return toShelfCard(updated, itemCount, cover);
  }

  async deleteShelf(userId: string, shelfId: string): Promise<void> {
    const shelf = await this.prisma.reelShelf.findFirst({ where: { id: shelfId, userId } });
    if (!shelf) throw new TesseraHttpError(404, 'NOT_FOUND', 'Reel Shelf not found.');
    await this.prisma.reelShelf.delete({ where: { id: shelfId } });
  }

  async orderShelves(userId: string, shelfIds: string[]): Promise<{ items: ReelShelfCard[] }> {
    const existing = await this.prisma.reelShelf.findMany({ where: { userId } });
    if (existing.length !== shelfIds.length || existing.some((row) => !shelfIds.includes(row.id))) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Send every Reel Shelf id exactly once.');
    }
    await this.prisma.$transaction(
      shelfIds.map((id, index) => this.prisma.reelShelf.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.listMyShelves(userId);
  }

  async shelfDetail(ownerOrViewerId: string, shelfId: string, viewerId?: string): Promise<ReelShelfDetail> {
    const shelf = await this.prisma.reelShelf.findUnique({
      where: { id: shelfId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { moment: { include: MOMENT_INCLUDE } },
        },
        coverMedia: true,
        user: { include: { profile: true } },
      },
    });
    if (!shelf) throw new TesseraHttpError(404, 'NOT_FOUND', 'Reel Shelf not found.');
    await this.assertCanSeeProfile(shelf.userId, viewerId, shelf.user.profile?.isPrivate ?? false);
    const cover = shelf.coverMedia ? await this.media.toView(shelf.coverMedia) : null;
    const items = [];
    for (const item of shelf.items) {
      if (item.moment.deletedAt) continue;
      if (!(await this.visibleQuiet(item.moment, viewerId, true))) continue;
      items.push({
        id: item.id,
        keptAt: item.keptAt.toISOString(),
        sortOrder: item.sortOrder,
        moment: await this.mapMoment(item.moment, viewerId),
      });
    }
    return {
      ...toShelfCard(shelf, items.length, cover),
      items,
    };
  }

  async publicShelf(handle: string, shelfId: string, viewerId?: string): Promise<ReelShelfDetail> {
    const user = await this.users.loadByHandle(handle);
    const shelf = await this.prisma.reelShelf.findFirst({ where: { id: shelfId, userId: user.id } });
    if (!shelf) throw new TesseraHttpError(404, 'NOT_FOUND', 'Reel Shelf not found.');
    return this.shelfDetail(user.id, shelfId, viewerId);
  }

  private async listShelvesFor(ownerId: string, viewerId?: string): Promise<{ items: ReelShelfCard[] }> {
    const shelves = await this.prisma.reelShelf.findMany({
      where: { userId: ownerId },
      orderBy: { sortOrder: 'asc' },
      include: { coverMedia: true, _count: { select: { items: true } } },
    });
    const items: ReelShelfCard[] = [];
    for (const shelf of shelves) {
      const cover = shelf.coverMedia ? await this.media.toView(shelf.coverMedia) : null;
      items.push(toShelfCard(shelf, shelf._count.items, cover));
    }
    void viewerId;
    return { items };
  }

  private async mapMoment(
    moment: {
      id: string;
      visibility: 'public' | 'followers' | 'circles';
      publishedAt: Date | null;
      expiresAt: Date | null;
      expiredAt: Date | null;
      createdAt: Date;
      author: { id: string; handle: string; profile: { displayName: string; avatarKey?: string | null } | null };
      segments: Array<{
        id: string;
        sortOrder: number;
        durationMs: number;
        media: Parameters<MediaService['toView']>[0];
        stickers: Parameters<typeof toSegmentView>[0]['stickers'];
        views: { viewerId: string }[];
        reactions: { userId: string; emoji: string }[];
      }>;
      shelfItems: { shelfId: string }[];
    },
    viewerId?: string,
  ): Promise<MomentCard> {
    const isAuthor = viewerId === moment.author.id;
    const segments = [];
    for (const segment of moment.segments) {
      segments.push(
        toSegmentView(segment, await this.media.toView(segment.media), viewerId, isAuthor),
      );
    }
    return toMomentCard({
      moment,
      authorAvatarUrl: await this.storage.signGet(moment.author.profile?.avatarKey ?? null),
      segments,
      viewerId,
      canKeep: canKeepMoment({
        publishedAt: moment.publishedAt,
        expiresAt: moment.expiresAt,
        expiredAt: moment.expiredAt,
        deletedAt: null,
      }),
    });
  }

  private async notifyMomentMentions(momentId: string, authorId: string): Promise<void> {
    const stickers = await this.prisma.momentSticker.findMany({
      where: { kind: 'mention', segment: { momentId } },
    });
    const handles = new Set<string>();
    for (const sticker of stickers) {
      const payload =
        sticker.payload && typeof sticker.payload === 'object' && !Array.isArray(sticker.payload)
          ? (sticker.payload as { handle?: unknown })
          : {};
      if (typeof payload.handle === 'string' && payload.handle.length > 0) {
        handles.add(payload.handle.toLowerCase());
      }
    }
    if (handles.size === 0) return;
    const users = await this.prisma.user.findMany({
      where: { handle: { in: [...handles] } },
      select: { id: true },
    });
    for (const user of users) {
      await this.notifications.notify({
        recipientId: user.id,
        actorId: authorId,
        kind: 'mention',
        targetType: 'moment',
        targetId: momentId,
        payload: { momentId },
      });
    }
  }

  private persistPayload(sticker: MomentStickerInput): Record<string, unknown> {
    if (sticker.kind === 'hashtag') {
      return { tag: normalizeHashtag(sticker.payload.tag) };
    }
    if (sticker.kind === 'mention') {
      return { handle: sticker.payload.handle.replace(/^@/, '').toLowerCase() };
    }
    return sticker.payload as Record<string, unknown>;
  }

  private async assertSticker(
    userId: string,
    accountType: 'personal' | 'creator' | 'business',
    sticker: MomentStickerInput,
  ): Promise<void> {
    if (sticker.kind === 'link' && !linkStickerAllowed(accountType)) {
      throw new TesseraHttpError(
        403,
        'LINK_NOT_ELIGIBLE',
        'Link stickers are for Creator and Business accounts.',
      );
    }
    if (sticker.kind === 'mention') {
      const handle = sticker.payload.handle.replace(/^@/, '').toLowerCase();
      const tagged = await this.prisma.user.findUnique({ where: { handle } });
      if (!tagged) throw new TesseraHttpError(400, 'VALIDATION', `No account @${handle}.`);
      if (await this.users.isBlockedEitherWay(userId, tagged.id)) {
        throw new TesseraHttpError(400, 'VALIDATION', 'You cannot mention that person.');
      }
    }
    if (sticker.kind === 'countdown') {
      const ends = new Date(sticker.payload.endsAt);
      if (ends.getTime() <= Date.now()) {
        throw new TesseraHttpError(400, 'VALIDATION', 'A countdown has to end in the future.');
      }
    }
    void userId;
  }

  private async requireAuthor(userId: string, momentId: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id: momentId }, include: MOMENT_INCLUDE });
    if (!moment || moment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    if (moment.authorId !== userId) throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the author can do that.');
    return moment;
  }

  private async requireVisible(momentId: string, viewerId: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id: momentId }, include: MOMENT_INCLUDE });
    if (!moment || moment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    await this.assertVisible(moment, viewerId, false);
    return moment;
  }

  private async assertCanSeeProfile(ownerId: string, viewerId: string | undefined, isPrivate: boolean) {
    if (viewerId && viewerId !== ownerId && (await this.users.isBlockedEitherWay(viewerId, ownerId))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    if (!isPrivate || viewerId === ownerId) return;
    const follows = viewerId
      ? await this.prisma.follow.findUnique({
          where: { followerId_followeeId: { followerId: viewerId, followeeId: ownerId } },
        })
      : null;
    if (follows?.status !== 'accepted') {
      throw new TesseraHttpError(403, 'PRIVATE', 'This account is private.');
    }
  }

  private async visibleQuiet(
    moment: {
      authorId: string;
      visibility: 'public' | 'followers' | 'circles';
      publishedAt: Date | null;
      deletedAt: Date | null;
      expiredAt: Date | null;
      author: { profile: { isPrivate: boolean; momentArchiveEnabled?: boolean } | null };
      id?: string;
    },
    viewerId: string | undefined,
    keptVisible: boolean,
  ): Promise<boolean> {
    try {
      await this.assertVisible(moment, viewerId, keptVisible);
      return true;
    } catch {
      return false;
    }
  }

  private async assertVisible(
    moment: {
      authorId: string;
      visibility: 'public' | 'followers' | 'circles';
      publishedAt: Date | null;
      deletedAt: Date | null;
      expiredAt: Date | null;
      author: { profile: { isPrivate: boolean; momentArchiveEnabled?: boolean } | null };
      id?: string;
    },
    viewerId: string | undefined,
    keptVisible: boolean,
  ): Promise<void> {
    const blocked = viewerId ? await this.users.isBlockedEitherWay(viewerId, moment.authorId) : false;
    const follows = viewerId
      ? await this.prisma.follow.findUnique({
          where: { followerId_followeeId: { followerId: viewerId, followeeId: moment.authorId } },
        })
      : null;
    const viewerInAuthorCircle =
      moment.visibility === 'circles' && moment.id
        ? await viewerInMomentCircles(this.prisma, moment.id, viewerId)
        : false;
    const ok = canViewMoment({
      authorId: moment.authorId,
      viewerId,
      visibility: moment.visibility,
      viewerInAuthorCircle,
      authorPrivate: moment.author.profile?.isPrivate ?? false,
      viewerFollowsAuthor: follows?.status === 'accepted' || viewerId === moment.authorId,
      blockedEitherWay: blocked,
      published: Boolean(moment.publishedAt),
      deleted: Boolean(moment.deletedAt),
      expired: Boolean(moment.expiredAt),
      keptVisible,
      archiveForAuthor: moment.author.profile?.momentArchiveEnabled ?? false,
    });
    if (!ok) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
  }
}

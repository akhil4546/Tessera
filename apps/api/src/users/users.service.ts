import { Injectable } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import type { MeProfile, Paginated, PublicProfile, SessionView } from '@tessera/types';
import {
  HANDLE_CHANGE_COOLDOWN_DAYS,
  type UpdateProfileInput,
  extractBioUrls,
} from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { cursorWhere, encodeCursor } from '../common/pagination.js';
import { SearchService } from '../discovery/search.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { emptyViewer, handleCooldownEnds, toMeProfile, toPublicProfile } from './profile.mapper.js';

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }> & {
  profile: NonNullable<Prisma.UserGetPayload<{ include: { profile: true } }>['profile']>;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly search: SearchService,
  ) {}

  private async avatarUrl(key: string | null | undefined): Promise<string | null> {
    return this.storage.signGet(key ?? null);
  }

  async getMe(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, totp: true },
    });
    if (!user?.profile) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const counts = await this.counts(user.id);
    const me = toMeProfile(user, counts, Boolean(user.totp?.enabledAt), await this.avatarUrl(user.profile?.avatarKey));
    const deletion = await this.prisma.deletionRequest.findFirst({
      where: { userId, status: 'pending' },
    });
    if (deletion) {
      me.deletion = { pending: true, executeAt: deletion.executeAt.toISOString() };
    }
    return me;
  }

  async updateMe(userId: string, input: UpdateProfileInput): Promise<MeProfile> {
    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.pronouns !== undefined) data.pronouns = input.pronouns;
    if (input.category !== undefined) data.category = input.category;
    if (input.links !== undefined) data.links = input.links;
    if (input.accountType !== undefined) data.accountType = input.accountType;
    if (input.memoryMapEnabled !== undefined) data.memoryMapEnabled = input.memoryMapEnabled;
    if (input.defaultAppreciation !== undefined) data.defaultAppreciation = input.defaultAppreciation;
    if (input.momentArchiveEnabled !== undefined) data.momentArchiveEnabled = input.momentArchiveEnabled;
    if (input.activityStatusEnabled !== undefined) data.activityStatusEnabled = input.activityStatusEnabled;
    if (input.readReceiptsEnabled !== undefined) data.readReceiptsEnabled = input.readReceiptsEnabled;
    if (input.sensitivityLevel !== undefined) data.sensitivityLevel = input.sensitivityLevel;
    if (input.whoCanMessage !== undefined) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isMinor: true } });
      if (user?.isMinor && input.whoCanMessage === 'everyone') {
        throw new TesseraHttpError(
          403,
          'MINOR_DM_LIMIT',
          'Accounts under 18 can only receive messages from people who follow them.',
        );
      }
      data.whoCanMessage = input.whoCanMessage;
    }
    await this.prisma.profile.update({ where: { userId }, data });
    await this.search.indexUser(userId);
    return this.getMe(userId);
  }

  async updateHandle(userId: string, handle: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (user.handle === handle) return this.getMe(userId);
    const cooldown = handleCooldownEnds(user.handleChangedAt);
    if (cooldown) {
      throw new TesseraHttpError(
        409,
        'HANDLE_COOLDOWN',
        `You can change your handle again after ${cooldown.toISOString().slice(0, 10)} (${HANDLE_CHANGE_COOLDOWN_DAYS}-day cooldown).`,
      );
    }
    const taken = await this.prisma.user.findUnique({ where: { handle }, select: { id: true } });
    if (taken) throw new TesseraHttpError(409, 'HANDLE_TAKEN', 'That handle is taken.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { handle, handleChangedAt: new Date() },
    });
    await this.search.indexUser(userId);
    return this.getMe(userId);
  }

  async updatePrivacy(
    userId: string,
    input: { isPrivate?: boolean; momentArchiveEnabled?: boolean },
  ): Promise<MeProfile> {
    const data: { isPrivate?: boolean; momentArchiveEnabled?: boolean } = {};
    if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;
    if (input.momentArchiveEnabled !== undefined) data.momentArchiveEnabled = input.momentArchiveEnabled;
    if (Object.keys(data).length > 0) {
      await this.prisma.profile.update({ where: { userId }, data });
      await this.search.indexUser(userId);
    }
    return this.getMe(userId);
  }

  async getPublicByHandle(
    handle: string,
    viewerId?: string,
    options?: { includeBlocked?: boolean },
  ): Promise<PublicProfile> {
    const user = await this.loadByHandle(handle);
    if (viewerId && viewerId !== user.id && !options?.includeBlocked) {
      const blocked = await this.isBlockedEitherWay(viewerId, user.id);
      if (blocked) throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const counts = await this.counts(user.id);
    const viewer = await this.viewerRelation(user.id, viewerId);
    return toPublicProfile(user, counts, viewer, await this.avatarUrl(user.profile?.avatarKey));
  }

  async listFollowers(
    handle: string,
    viewerId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const user = await this.loadByHandle(handle);
    await this.assertCanListGraph(user, viewerId);
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.follow.findMany({
      where: {
        followeeId: user.id,
        status: 'accepted',
        ...(extra ?? {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { follower: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (viewerId && (await this.isBlockedEitherWay(viewerId, row.follower.id))) continue;
      const counts = await this.counts(row.follower.id);
      const viewer = await this.viewerRelation(row.follower.id, viewerId);
      items.push(
        toPublicProfile(row.follower, counts, viewer, await this.avatarUrl(row.follower.profile?.avatarKey)),
      );
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async listFollowing(
    handle: string,
    viewerId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const user = await this.loadByHandle(handle);
    await this.assertCanListGraph(user, viewerId);
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.follow.findMany({
      where: {
        followerId: user.id,
        status: 'accepted',
        ...(extra ?? {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { followee: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (viewerId && (await this.isBlockedEitherWay(viewerId, row.followee.id))) continue;
      const counts = await this.counts(row.followee.id);
      const viewer = await this.viewerRelation(row.followee.id, viewerId);
      items.push(
        toPublicProfile(row.followee, counts, viewer, await this.avatarUrl(row.followee.profile?.avatarKey)),
      );
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ip: row.ip,
      lastUsedAt: row.lastUsedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId: string): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new TesseraHttpError(400, 'CURRENT_SESSION', 'Sign out to end this session.');
    }
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) throw new TesseraHttpError(404, 'NOT_FOUND', 'Session not found.');
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async present(user: UserWithProfile, viewerId?: string): Promise<PublicProfile> {
    const counts = await this.counts(user.id);
    const viewer = await this.viewerRelation(user.id, viewerId);
    return toPublicProfile(user, counts, viewer, await this.avatarUrl(user.profile?.avatarKey));
  }

  async loadByHandle(handle: string): Promise<UserWithProfile> {
    const user = await this.prisma.user.findUnique({
      where: { handle: handle.toLowerCase() },
      include: { profile: true },
    });
    if (!user?.profile || user.deactivatedAt || user.suspendedAt) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    return { ...user, profile: user.profile };
  }

  async counts(userId: string): Promise<{ followers: number; following: number; posts: number }> {
    const [followers, following, posts] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId, status: 'accepted' } }),
      this.prisma.follow.count({ where: { followerId: userId, status: 'accepted' } }),
      this.prisma.post.count({
        where: { authorId: userId, deletedAt: null, publishedAt: { not: null }, archivedAt: null },
      }),
    ]);
    return { followers, following, posts };
  }

  async setAvatar(userId: string, mediaId: string) {
    const media = await this.prisma.mediaItem.findUnique({ where: { id: mediaId } });
    if (!media || media.ownerId !== userId || media.purpose !== 'avatar') {
      throw new TesseraHttpError(400, 'VALIDATION', 'Choose an avatar image you uploaded.');
    }
    if (media.status !== 'ready') {
      throw new TesseraHttpError(409, 'MEDIA_NOT_READY', 'Wait until the image has finished processing.');
    }
    await this.prisma.profile.update({ where: { userId }, data: { avatarKey: media.originalKey } });
    return this.getMe(userId);
  }

  async isAcceptedFollower(followerId: string, followeeId: string): Promise<boolean> {
    const row = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { status: true },
    });
    return row?.status === 'accepted';
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async viewerRelation(targetId: string, viewerId?: string) {
    if (!viewerId) return emptyViewer(false);
    if (viewerId === targetId) return emptyViewer(true);
    const [outgoing, incoming, block, mute, restrict] = await Promise.all([
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: targetId, followeeId: viewerId } },
      }),
      this.prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } },
      }),
      this.prisma.mute.findUnique({
        where: { muterId_mutedId: { muterId: viewerId, mutedId: targetId } },
      }),
      this.prisma.restrict.findUnique({
        where: { restrictorId_restrictedId: { restrictorId: viewerId, restrictedId: targetId } },
      }),
    ]);
    return {
      isSelf: false,
      following: outgoing?.status === 'accepted',
      followedBy: incoming?.status === 'accepted',
      followStatus: (outgoing?.status ?? 'none') as 'none' | 'pending' | 'accepted',
      blockedByMe: Boolean(block),
      mutedByMe: Boolean(mute),
      muteScope: mute?.scope ?? null,
      restrictedByMe: Boolean(restrict),
    };
  }

  private async assertCanListGraph(
    user: { id: string; profile: { isPrivate: boolean } | null },
    viewerId?: string,
  ): Promise<void> {
    if (!user.profile?.isPrivate) return;
    if (viewerId === user.id) return;
    if (!viewerId) {
      throw new TesseraHttpError(403, 'PRIVATE', 'This account is private.');
    }
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: user.id } },
    });
    if (follow?.status !== 'accepted') {
      throw new TesseraHttpError(403, 'PRIVATE', 'This account is private.');
    }
  }

  bioUrls(bio: string): string[] {
    return extractBioUrls(bio);
  }
}

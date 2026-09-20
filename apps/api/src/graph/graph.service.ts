import { Injectable } from '@nestjs/common';
import type { Paginated, PublicProfile } from '@tessera/types';
import { TesseraHttpError } from '../common/http-error.js';
import { cursorWhere, encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostsService } from '../posts/posts.service.js';
import { decideFollow } from './graph.rules.js';

@Injectable()
export class GraphService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly posts: PostsService,
    private readonly inbox: InboxService,
    private readonly notifications: NotificationsService,
  ) {}

  async follow(actorId: string, handle: string): Promise<PublicProfile> {
    await this.rateLimit.consume(`follow:${actorId}`, 60, 60 * 60);
    const target = await this.users.loadByHandle(handle);
    const blocked = await this.users.isBlockedEitherWay(actorId, target.id);
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: actorId, followeeId: target.id } },
    });
    const decision = decideFollow({
      actorId,
      targetId: target.id,
      blockedEitherWay: blocked,
      targetPrivate: target.profile?.isPrivate ?? false,
      existingStatus: existing?.status ?? null,
    });
    if (decision.type === 'error') {
      if (decision.code === 'SELF') {
        throw new TesseraHttpError(400, 'SELF', 'You cannot follow yourself.');
      }
      if (decision.code === 'BLOCKED') {
        throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
      }
      throw new TesseraHttpError(409, 'ALREADY', 'You already follow this account, or a request is pending.');
    }
    await this.prisma.follow.create({
      data: {
        followerId: actorId,
        followeeId: target.id,
        status: decision.status,
        acceptedAt: decision.status === 'accepted' ? new Date() : null,
      },
    });
    if (decision.status === 'accepted') {
      await this.posts.onFollowAccepted(actorId, target.id);
      await this.notifications.notify({
        recipientId: target.id,
        actorId,
        kind: 'new_follower',
        targetType: 'user',
        targetId: actorId,
      });
    } else {
      await this.notifications.notify({
        recipientId: target.id,
        actorId,
        kind: 'follow_request',
        targetType: 'user',
        targetId: actorId,
      });
    }
    return this.users.getPublicByHandle(handle, actorId);
  }

  async unfollow(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    await this.prisma.follow.deleteMany({
      where: { followerId: actorId, followeeId: target.id },
    });
    await this.posts.onUnfollow(actorId, target.id);
    return this.users.getPublicByHandle(handle, actorId);
  }

  async accept(actorId: string, handle: string): Promise<PublicProfile> {
    const requester = await this.users.loadByHandle(handle);
    const updated = await this.prisma.follow.updateMany({
      where: { followerId: requester.id, followeeId: actorId, status: 'pending' },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No pending request from that account.');
    }
    await this.posts.onFollowAccepted(requester.id, actorId);
    await this.notifications.markKindRead(actorId, 'follow_request', requester.id);
    return this.users.getPublicByHandle(handle, actorId);
  }

  async decline(actorId: string, handle: string): Promise<void> {
    const requester = await this.users.loadByHandle(handle);
    const deleted = await this.prisma.follow.deleteMany({
      where: { followerId: requester.id, followeeId: actorId, status: 'pending' },
    });
    if (deleted.count === 0) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No pending request from that account.');
    }
    await this.notifications.markKindRead(actorId, 'follow_request', requester.id);
  }

  async removeFollower(actorId: string, handle: string): Promise<PublicProfile> {
    const follower = await this.users.loadByHandle(handle);
    await this.prisma.follow.deleteMany({
      where: { followerId: follower.id, followeeId: actorId, status: 'accepted' },
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async listFollowRequests(
    actorId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.follow.findMany({
      where: { followeeId: actorId, status: 'pending', ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { follower: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (!row.follower.profile) continue;
      items.push(await this.users.present({ ...row.follower, profile: row.follower.profile }, actorId));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async block(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    if (target.id === actorId) {
      throw new TesseraHttpError(400, 'SELF', 'You cannot block yourself.');
    }
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: actorId, blockedId: target.id } },
        create: { blockerId: actorId, blockedId: target.id },
        update: {},
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: actorId, followeeId: target.id },
            { followerId: target.id, followeeId: actorId },
          ],
        },
      }),
      this.prisma.mute.deleteMany({
        where: {
          OR: [
            { muterId: actorId, mutedId: target.id },
            { muterId: target.id, mutedId: actorId },
          ],
        },
      }),
      this.prisma.restrict.deleteMany({
        where: {
          OR: [
            { restrictorId: actorId, restrictedId: target.id },
            { restrictorId: target.id, restrictedId: actorId },
          ],
        },
      }),
      this.prisma.circleMember.deleteMany({
        where: {
          OR: [
            { userId: target.id, circle: { ownerId: actorId } },
            { userId: actorId, circle: { ownerId: target.id } },
          ],
        },
      }),
      this.prisma.boardCollaborator.deleteMany({
        where: {
          OR: [
            { userId: target.id, board: { ownerId: actorId } },
            { userId: actorId, board: { ownerId: target.id } },
          ],
        },
      }),
      this.prisma.boardFollow.deleteMany({
        where: {
          OR: [
            { userId: target.id, board: { ownerId: actorId } },
            { userId: actorId, board: { ownerId: target.id } },
          ],
        },
      }),
    ]);
    await this.posts.onUnfollowOrBlock(actorId, target.id);
    await this.inbox.onBlock(actorId, target.id);
    return this.users.getPublicByHandle(handle, actorId, { includeBlocked: true });
  }

  async unblock(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    await this.prisma.block.deleteMany({
      where: { blockerId: actorId, blockedId: target.id },
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async mute(actorId: string, handle: string, scope: 'posts' | 'moments' | 'both'): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    if (target.id === actorId) {
      throw new TesseraHttpError(400, 'SELF', 'You cannot mute yourself.');
    }
    if (await this.users.isBlockedEitherWay(actorId, target.id)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    await this.prisma.mute.upsert({
      where: { muterId_mutedId: { muterId: actorId, mutedId: target.id } },
      create: { muterId: actorId, mutedId: target.id, scope },
      update: { scope },
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async unmute(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    await this.prisma.mute.deleteMany({
      where: { muterId: actorId, mutedId: target.id },
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async listBlocked(
    actorId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.block.findMany({
      where: { blockerId: actorId, ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { blocked: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (!row.blocked.profile) continue;
      items.push(await this.users.present({ ...row.blocked, profile: row.blocked.profile }, actorId));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async restrict(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    if (target.id === actorId) {
      throw new TesseraHttpError(400, 'SELF', 'You cannot restrict yourself.');
    }
    if (await this.users.isBlockedEitherWay(actorId, target.id)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    await this.prisma.restrict.upsert({
      where: { restrictorId_restrictedId: { restrictorId: actorId, restrictedId: target.id } },
      create: { restrictorId: actorId, restrictedId: target.id },
      update: {},
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async unrestrict(actorId: string, handle: string): Promise<PublicProfile> {
    const target = await this.users.loadByHandle(handle);
    await this.prisma.restrict.deleteMany({
      where: { restrictorId: actorId, restrictedId: target.id },
    });
    return this.users.getPublicByHandle(handle, actorId);
  }

  async listRestricted(
    actorId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.restrict.findMany({
      where: { restrictorId: actorId, ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { restricted: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (!row.restricted.profile) continue;
      items.push(await this.users.present({ ...row.restricted, profile: row.restricted.profile }, actorId));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async listMuted(
    actorId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Paginated<PublicProfile>> {
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.mute.findMany({
      where: { muterId: actorId, ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { muted: { include: { profile: true } } },
    });
    const slice = rows.slice(0, limit);
    const items: PublicProfile[] = [];
    for (const row of slice) {
      if (!row.muted.profile) continue;
      items.push(await this.users.present({ ...row.muted, profile: row.muted.profile }, actorId));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}

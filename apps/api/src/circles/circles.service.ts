import { Injectable } from '@nestjs/common';
import {
  MAX_CIRCLE_MEMBERS,
  MAX_CIRCLES_PER_USER,
  backfillCirclePostsIntoViewer,
  retractInaccessibleCirclePosts,
} from '@tessera/media';
import type { CircleDetail, CircleSummary } from '@tessera/types';
import type { CreateCircleInput, UpdateCircleInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  async list(ownerId: string): Promise<{ items: CircleSummary[] }> {
    const rows = await this.prisma.circle.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return { items: rows.map((row) => this.toSummary(row, row._count.members)) };
  }

  async get(ownerId: string, id: string): Promise<CircleDetail> {
    const circle = await this.requireOwned(ownerId, id);
    const members = await this.prisma.circleMember.findMany({
      where: { circleId: circle.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { include: { profile: true } } },
    });
    const items = [];
    for (const row of members) {
      items.push({
        id: row.user.id,
        handle: row.user.handle,
        displayName: row.user.profile?.displayName ?? row.user.handle,
        avatarUrl: await this.storage.signGet(row.user.profile?.avatarKey ?? null),
        addedAt: row.createdAt.toISOString(),
      });
    }
    return {
      ...this.toSummary(circle, members.length),
      members: items,
    };
  }

  async create(ownerId: string, input: CreateCircleInput): Promise<CircleSummary> {
    const count = await this.prisma.circle.count({ where: { ownerId } });
    if (count >= MAX_CIRCLES_PER_USER) {
      throw new TesseraHttpError(400, 'CIRCLE_LIMIT', `You can have ${MAX_CIRCLES_PER_USER} Circles.`);
    }
    const name = input.name.trim();
    const existing = await this.prisma.circle.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
    if (existing) {
      throw new TesseraHttpError(409, 'CIRCLE_NAME_TAKEN', 'You already have a Circle with that name.');
    }
    const row = await this.prisma.circle.create({ data: { ownerId, name } });
    return this.toSummary(row, 0);
  }

  async rename(ownerId: string, id: string, input: UpdateCircleInput): Promise<CircleSummary> {
    const circle = await this.requireOwned(ownerId, id);
    const name = input.name.trim();
    const clash = await this.prisma.circle.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
    if (clash && clash.id !== circle.id) {
      throw new TesseraHttpError(409, 'CIRCLE_NAME_TAKEN', 'You already have a Circle with that name.');
    }
    const row = await this.prisma.circle.update({ where: { id: circle.id }, data: { name } });
    const memberCount = await this.prisma.circleMember.count({ where: { circleId: row.id } });
    return this.toSummary(row, memberCount);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const circle = await this.requireOwned(ownerId, id);
    const members = await this.prisma.circleMember.findMany({
      where: { circleId: circle.id },
      select: { userId: true },
    });
    await this.prisma.circle.delete({ where: { id: circle.id } });
    for (const member of members) {
      await retractInaccessibleCirclePosts(this.prisma, member.userId, ownerId);
    }
  }

  async addMember(ownerId: string, id: string, handle: string): Promise<CircleDetail> {
    const circle = await this.requireOwned(ownerId, id);
    const target = await this.users.loadByHandle(handle);
    if (target.id === ownerId) {
      throw new TesseraHttpError(400, 'SELF', 'You do not add yourself to a Circle.');
    }
    if (await this.users.isBlockedEitherWay(ownerId, target.id)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const count = await this.prisma.circleMember.count({ where: { circleId: circle.id } });
    if (count >= MAX_CIRCLE_MEMBERS) {
      throw new TesseraHttpError(400, 'CIRCLE_MEMBER_LIMIT', `A Circle can hold ${MAX_CIRCLE_MEMBERS} people.`);
    }
    await this.prisma.circleMember.upsert({
      where: { circleId_userId: { circleId: circle.id, userId: target.id } },
      create: { circleId: circle.id, userId: target.id },
      update: {},
    });
    await backfillCirclePostsIntoViewer(this.prisma, target.id, ownerId);
    return this.get(ownerId, circle.id);
  }

  async removeMember(ownerId: string, id: string, handle: string): Promise<CircleDetail> {
    const circle = await this.requireOwned(ownerId, id);
    const target = await this.users.loadByHandle(handle);
    await this.prisma.circleMember.deleteMany({
      where: { circleId: circle.id, userId: target.id },
    });
    await retractInaccessibleCirclePosts(this.prisma, target.id, ownerId);
    return this.get(ownerId, circle.id);
  }

  private async requireOwned(ownerId: string, id: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id } });
    if (!circle || circle.ownerId !== ownerId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Circle not found.');
    }
    return circle;
  }

  private toSummary(
    row: { id: string; name: string; createdAt: Date; updatedAt: Date },
    memberCount: number,
  ): CircleSummary {
    return {
      id: row.id,
      name: row.name,
      memberCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import {
  MAX_CIRCLE_MEMBERS,
  MAX_CIRCLES_PER_USER,
  resolveContentAudience,
  type ContentVisibility,
} from '@tessera/media';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TesseraHttpError } from '../common/http-error.js';

export { resolveContentAudience, MAX_CIRCLES_PER_USER, MAX_CIRCLE_MEMBERS };
export type { ContentVisibility };

export async function assertOwnedCircleIds(
  prisma: PrismaService,
  ownerId: string,
  circleIds: string[],
): Promise<string[]> {
  const unique = [...new Set(circleIds)];
  if (unique.length === 0) {
    throw new TesseraHttpError(400, 'CIRCLES_REQUIRED', 'Pick at least one Circle.');
  }
  const owned = await prisma.circle.findMany({
    where: { id: { in: unique }, ownerId },
    select: { id: true },
  });
  if (owned.length !== unique.length) {
    throw new TesseraHttpError(400, 'CIRCLE_NOT_FOUND', 'Every Circle must belong to you.');
  }
  return unique;
}

export async function viewerInPostCircles(
  prisma: PrismaService,
  postId: string,
  viewerId: string | undefined,
): Promise<boolean> {
  if (!viewerId) return false;
  const row = await prisma.postAudience.findFirst({
    where: { postId, circle: { members: { some: { userId: viewerId } } } },
    select: { postId: true },
  });
  return Boolean(row);
}

export async function viewerInMomentCircles(
  prisma: PrismaService,
  momentId: string,
  viewerId: string | undefined,
): Promise<boolean> {
  if (!viewerId) return false;
  const row = await prisma.momentAudience.findFirst({
    where: { momentId, circle: { members: { some: { userId: viewerId } } } },
    select: { momentId: true },
  });
  return Boolean(row);
}

export function parseFutureSchedule(value: string | undefined, now = new Date()): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime() + 15_000) {
    throw new TesseraHttpError(400, 'SCHEDULED_IN_PAST', 'Schedule a time in the future.');
  }
  return date;
}

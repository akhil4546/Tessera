import type { TesseraPrisma } from '@tessera/db';
import { expiryAction } from './moments.ts';
import type { ObjectStorage } from './storage.ts';
import { asVariantMap } from './variants.ts';

export type ExpireMomentsResult = {
  scanned: number;
  kept: number;
  archived: number;
  deleted: number;
};

export async function expireMoments(
  prisma: TesseraPrisma,
  storage: ObjectStorage | null,
  now = new Date(),
): Promise<ExpireMomentsResult> {
  const due = await prisma.moment.findMany({
    where: {
      expiredAt: null,
      deletedAt: null,
      publishedAt: { not: null },
      expiresAt: { lte: now },
    },
    include: {
      segments: true,
      shelfItems: true,
      author: { include: { profile: true } },
    },
  });

  const result: ExpireMomentsResult = { scanned: due.length, kept: 0, archived: 0, deleted: 0 };

  for (const moment of due) {
    const action = expiryAction({
      kept: moment.shelfItems.length > 0,
      archiveEnabled: moment.author.profile?.momentArchiveEnabled ?? false,
    });

    await prisma.moment.update({
      where: { id: moment.id },
      data: { expiredAt: now },
    });

    if (action === 'keep') {
      result.kept += 1;
      continue;
    }
    if (action === 'archive') {
      result.archived += 1;
      continue;
    }

    const mediaIds = moment.segments.map((segment) => segment.mediaId);
    await prisma.moment.delete({ where: { id: moment.id } });
    for (const mediaId of mediaIds) {
      await deleteUnreferencedMedia(prisma, storage, mediaId);
    }
    result.deleted += 1;
  }

  return result;
}

async function deleteUnreferencedMedia(
  prisma: TesseraPrisma,
  storage: ObjectStorage | null,
  mediaId: string,
): Promise<void> {
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: { momentSegments: true, reelShelfCovers: true },
  });
  if (!media) return;
  if (media.postId) return;
  if (media.momentSegments.length > 0) return;
  if (media.reelShelfCovers.length > 0) return;
  if (media.purpose === 'avatar') return;

  if (storage) {
    await deleteStoredObject(storage, media.originalKey);
    const variants = asVariantMap(media.variants);
    for (const keys of Object.values(variants.widths)) {
      await deleteStoredObject(storage, keys.webp);
      await deleteStoredObject(storage, keys.avif);
    }
    if (variants.posterKey) await deleteStoredObject(storage, variants.posterKey);
    if (variants.hls?.masterKey) await deleteStoredObject(storage, variants.hls.masterKey);
  }

  await prisma.mediaItem.delete({ where: { id: mediaId } });
}

async function deleteStoredObject(storage: ObjectStorage, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch {
    /* Missing objects are fine — expiry should not fail the job. */
  }
}

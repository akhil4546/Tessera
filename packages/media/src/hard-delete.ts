import type { TesseraPrisma } from '@tessera/db';
import type { MediaLogger } from './logger.ts';
import type { ObjectStorage } from './storage.ts';

export const DELETION_GRACE_DAYS = 30;

export async function hardDeleteDueAccounts(
  prisma: TesseraPrisma,
  storage: ObjectStorage,
  now = new Date(),
  log?: MediaLogger,
): Promise<{ scanned: number; deleted: number }> {
  const due = await prisma.deletionRequest.findMany({
    where: { status: 'pending', executeAt: { lte: now } },
    take: 20,
  });
  let deleted = 0;
  for (const request of due) {
    const userId = request.userId;
    const media = await prisma.mediaItem.findMany({ where: { ownerId: userId }, select: { originalKey: true, variants: true } });
    for (const item of media) {
      await storage.delete(item.originalKey).catch(() => undefined);
      const variants = item.variants as { widths?: Record<string, { webp?: string; avif?: string }>; posterKey?: string; hls?: { masterKey?: string }; audioKey?: string };
      for (const width of Object.values(variants.widths ?? {})) {
        if (width.webp) await storage.delete(width.webp).catch(() => undefined);
        if (width.avif) await storage.delete(width.avif).catch(() => undefined);
      }
      if (variants.posterKey) await storage.delete(variants.posterKey).catch(() => undefined);
      if (variants.hls?.masterKey) await storage.delete(variants.hls.masterKey).catch(() => undefined);
      if (variants.audioKey) await storage.delete(variants.audioKey).catch(() => undefined);
    }
    const exports = await prisma.exportJob.findMany({ where: { userId, archiveKey: { not: null } } });
    for (const job of exports) {
      if (job.archiveKey) await storage.delete(job.archiveKey).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: userId } });
    deleted += 1;
    log?.info({ userId, requestId: request.id }, 'hard-deleted account after 30-day grace');
  }
  return { scanned: due.length, deleted };
}

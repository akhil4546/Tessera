import type { TesseraPrisma } from '@tessera/db';
import type { MediaLogger } from './logger.ts';
import type { ObjectStorage } from './storage.ts';
import { zipStore } from './zip-store.ts';

export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ExportAccountMail = {
  sendExportReady: (to: string, downloadUrl: string) => Promise<boolean>;
};

function jsonFile(name: string, value: unknown): { name: string; body: Buffer } {
  return { name, body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8') };
}

export async function runExportJob(
  prisma: TesseraPrisma,
  storage: ObjectStorage,
  jobId: string,
  signGet: (key: string) => Promise<string | null>,
  mail: ExportAccountMail,
  log: MediaLogger,
): Promise<void> {
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    include: { user: { include: { profile: true } } },
  });
  if (!job || job.status === 'ready') return;

  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date(), error: null },
  });

  try {
    const userId = job.userId;
    const [posts, comments, moments, follows, blocks, mutes, restricts, conversations, notifications] =
      await Promise.all([
        prisma.post.findMany({
          where: { authorId: userId, deletedAt: null },
          include: { media: true, hashtags: { include: { hashtag: true } } },
        }),
        prisma.comment.findMany({ where: { authorId: userId, deletedAt: null } }),
        prisma.moment.findMany({
          where: { authorId: userId, deletedAt: null },
          include: { segments: { include: { media: true } } },
        }),
        prisma.follow.findMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } }),
        prisma.block.findMany({ where: { blockerId: userId } }),
        prisma.mute.findMany({ where: { muterId: userId } }),
        prisma.restrict.findMany({ where: { restrictorId: userId } }),
        prisma.conversationMember.findMany({
          where: { userId, leftAt: null },
          include: {
            conversation: {
              include: { messages: { where: { senderId: userId }, take: 500, orderBy: { createdAt: 'desc' } } },
            },
          },
        }),
        prisma.notification.findMany({ where: { recipientId: userId }, take: 500, orderBy: { updatedAt: 'desc' } }),
      ]);

    const profile = {
      id: job.user.id,
      handle: job.user.handle,
      email: job.user.email,
      dateOfBirth: job.user.dateOfBirth,
      isMinor: job.user.isMinor,
      createdAt: job.user.createdAt,
      profile: job.user.profile,
    };

    const files: { name: string; body: Buffer }[] = [
      jsonFile('account.json', profile),
      jsonFile(
        'posts.json',
        posts.map((post) => ({
          id: post.id,
          kind: post.kind,
          caption: post.caption,
          visibility: post.visibility,
          publishedAt: post.publishedAt,
          hashtags: post.hashtags.map((row) => row.hashtag.tag),
          mediaIds: post.media.map((row) => row.id),
        })),
      ),
      jsonFile('comments.json', comments),
      jsonFile('moments.json', moments.map((row) => ({ id: row.id, publishedAt: row.publishedAt, expiresAt: row.expiresAt }))),
      jsonFile('graph.json', { follows, blocks, mutes, restricts }),
      jsonFile(
        'messages.json',
        conversations.map((row) => ({
          conversationId: row.conversationId,
          messages: row.conversation.messages.map((msg) => ({
            id: msg.id,
            kind: msg.kind,
            body: msg.body,
            createdAt: msg.createdAt,
          })),
        })),
      ),
      jsonFile('notifications.json', notifications),
    ];

    const mediaRows = [
      ...posts.flatMap((post) => post.media),
      ...moments.flatMap((moment) => moment.segments.map((seg) => seg.media)),
    ];
    const seen = new Set<string>();
    for (const media of mediaRows) {
      if (seen.has(media.id)) continue;
      seen.add(media.id);
      try {
        const body = await storage.get(media.originalKey);
        const ext = media.mimeType.includes('png')
          ? 'png'
          : media.mimeType.includes('webp')
            ? 'webp'
            : media.kind === 'video'
              ? 'mp4'
              : media.kind === 'audio'
                ? 'm4a'
                : 'jpg';
        files.push({ name: `media/${media.id}.${ext}`, body });
      } catch (err) {
        log.warn({ err, mediaId: media.id }, 'export skipped missing media object');
      }
    }

    const zip = zipStore(files);
    const archiveKey = `exports/${userId}/${jobId}.zip`;
    await storage.put(archiveKey, zip, 'application/zip');
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'ready',
        archiveKey,
        byteSize: zip.length,
        finishedAt: new Date(),
        expiresAt,
      },
    });

    const url = await signGet(archiveKey);
    if (url) {
      const sent = await mail.sendExportReady(job.user.email, url);
      await prisma.exportJob.update({ where: { id: jobId }, data: { emailSent: sent } });
    }
    log.info({ jobId, userId, bytes: zip.length }, 'account export ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    log.error({ err, jobId }, 'account export failed');
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: message.slice(0, 500), finishedAt: new Date() },
    });
  }
}

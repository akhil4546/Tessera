import type { TesseraPrisma } from '@tessera/db';
import type { SecurityAlertKind } from '@tessera/types';
import { digestHourMatches, formatActivityCopy, localDayKey, mergeNotificationPreferences, parseActorIds } from './notifications.ts';
import type { MediaLogger } from './process-media.ts';

export async function sendNotificationDigests(
  prisma: TesseraPrisma,
  now: Date,
  sendDigest: (to: string, lines: string[]) => Promise<boolean>,
  log: MediaLogger,
): Promise<{ sent: number }> {
  const rows = await prisma.notificationPreference.findMany({
    where: { emailDigest: true },
    include: { user: true },
  });
  let sent = 0;
  for (const row of rows) {
    const prefs = mergeNotificationPreferences(row);
    if (!digestHourMatches(now, prefs.timezone, 9)) continue;
    const day = localDayKey(now, prefs.timezone);
    if (row.lastDigestAt && localDayKey(row.lastDigestAt, prefs.timezone) === day) continue;
    const unread = await prisma.notification.findMany({
      where: { recipientId: row.userId, readAt: null, kind: { not: 'security_alert' } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    if (unread.length === 0) {
      await prisma.notificationPreference.update({
        where: { userId: row.userId },
        data: { lastDigestAt: now },
      });
      continue;
    }
    const lines: string[] = [];
    for (const item of unread) {
      const actorIds = parseActorIds(item.actorIds);
      const actors = actorIds.length
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            include: { profile: true },
          })
        : [];
      const ordered = actorIds.flatMap((id) => {
        const user = actors.find((person) => person.id === id);
        return user ? [{ displayName: user.profile?.displayName ?? user.handle }] : [];
      });
      const payload =
        item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
          ? (item.payload as Record<string, unknown>)
          : {};
      lines.push(
        formatActivityCopy({
          kind: item.kind,
          actors: ordered,
          actorCount: item.actorCount,
          securityKind: (payload.securityKind as SecurityAlertKind | undefined) ?? null,
        }),
      );
    }
    const ok = await sendDigest(row.user.email, lines);
    if (ok) sent += 1;
    else log.warn({ userId: row.userId }, 'SOFT-FAIL: digest email not sent.');
    await prisma.notificationPreference.update({
      where: { userId: row.userId },
      data: { lastDigestAt: now },
    });
  }
  return { sent };
}

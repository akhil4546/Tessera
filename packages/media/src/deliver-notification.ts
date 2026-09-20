import type { TesseraPrisma } from '@tessera/db';
import type { NotificationKind, SecurityAlertKind } from '@tessera/types';
import { formatActivityCopy, mergeNotificationPreferences, parseActorIds, shouldSendChannel } from './notifications.ts';
import { expoConfigured, sendExpoPush, vapidConfigured, type ExpoPushMessage } from './push.ts';
import type { MediaLogger } from './process-media.ts';

export type NotificationMailPort = {
  sendActivity: (to: string, subject: string, body: string, href: string | null) => Promise<boolean>;
  sendSecurity: (to: string, body: string) => Promise<boolean>;
};

export type WebPushPort = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<{ invalid: boolean }>;

export async function deliverNotificationRecord(
  prisma: TesseraPrisma,
  notificationId: string,
  ports: {
    mail: NotificationMailPort;
    sendWebPush: WebPushPort;
    log: MediaLogger;
  },
): Promise<void> {
  const row = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!row) return;
  const recipient = await prisma.user.findUnique({ where: { id: row.recipientId } });
  if (!recipient) return;
  const prefRow = await prisma.notificationPreference.findUnique({ where: { userId: row.recipientId } });
  const prefs = prefRow
    ? mergeNotificationPreferences(prefRow)
    : mergeNotificationPreferences({
        channels: {},
        quietHoursEnabled: false,
        quietHoursStartMinutes: 1320,
        quietHoursEndMinutes: 420,
        timezone: 'UTC',
        emailDigest: false,
      });
  const actorIds = parseActorIds(row.actorIds);
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        include: { profile: true },
      })
    : [];
  const ordered = actorIds.flatMap((id) => {
    const user = actors.find((item) => item.id === id);
    return user ? [{ displayName: user.profile?.displayName ?? user.handle }] : [];
  });
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const body = formatActivityCopy({
    kind: row.kind as NotificationKind,
    actors: ordered,
    actorCount: row.actorCount,
    securityKind: (payload.securityKind as SecurityAlertKind | undefined) ?? null,
  });
  const now = new Date();
  const href = row.href;

  if (shouldSendChannel({ prefs, kind: row.kind as NotificationKind, channel: 'email', now })) {
    if (row.kind === 'security_alert') await ports.mail.sendSecurity(recipient.email, body);
    else await ports.mail.sendActivity(recipient.email, 'Tessera', body, href);
  }

  if (!shouldSendChannel({ prefs, kind: row.kind as NotificationKind, channel: 'push', now })) return;

  const devices = await prisma.device.findMany({ where: { userId: row.recipientId } });
  if (devices.length === 0) {
    ports.log.warn({ notificationId }, 'SOFT-FAIL: no push devices. In-app row still stored.');
    return;
  }

  const expo = devices.filter((device) => device.platform === 'expo');
  if (expo.length > 0) {
    if (!expoConfigured() && process.env.NODE_ENV !== 'test') {
      ports.log.warn({ notificationId }, 'SOFT-FAIL: Expo push not configured. Tokens are stored.');
    } else {
      try {
        const messages: ExpoPushMessage[] = expo.map((device) => ({
          to: device.token,
          title: 'Tessera',
          body,
          data: { href, notificationId, kind: row.kind },
          sound: 'default',
        }));
        const result = await sendExpoPush(messages, process.env.EXPO_ACCESS_TOKEN);
        if (result.invalidTokens.length > 0) {
          await prisma.device.deleteMany({
            where: { userId: row.recipientId, token: { in: result.invalidTokens } },
          });
        }
      } catch (err) {
        ports.log.warn(
          { notificationId, err: err instanceof Error ? err.message : 'error' },
          'SOFT-FAIL: Expo push failed.',
        );
      }
    }
  }

  const web = devices.filter((device) => device.platform === 'web_push');
  if (web.length > 0 && !vapidConfigured()) {
    ports.log.warn({ notificationId }, 'SOFT-FAIL: Web Push VAPID keys are not set. Subscription stored.');
    return;
  }
  const payloadJson = JSON.stringify({ title: 'Tessera', body, href, notificationId });
  for (const device of web) {
    const keys =
      device.keys && typeof device.keys === 'object' && !Array.isArray(device.keys)
        ? (device.keys as { p256dh?: string; auth?: string })
        : {};
    if (!keys.p256dh || !keys.auth) continue;
    const result = await ports.sendWebPush(
      { endpoint: device.token, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      payloadJson,
    );
    if (result.invalid) await prisma.device.deleteMany({ where: { id: device.id } });
  }
}

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import {
  activityHref,
  aggregateKeyFor,
  defaultNotificationPreferences,
  deliverNotificationRecord,
  kindsForInboxFilter,
  mergeActors,
  mergeNotificationPreferences,
  parseActorIds,
  shouldSendChannel,
  sendNotificationDigests,
  sendWebPush,
  vapidConfigured,
  vapidPublicKey,
} from '@tessera/media';
import type {
  AuthorPreview,
  DeviceView,
  InboxFilter,
  InboxSocketEvent,
  NotificationKind,
  NotificationPage,
  NotificationPreferences,
  NotificationView,
  SecurityAlertKind,
} from '@tessera/types';
import type {
  MarkNotificationsReadInput,
  RegisterDeviceInput,
  UpdateNotificationPreferencesInput,
} from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { decodeCursor, encodeCursor } from '../common/pagination.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import { toNotificationView } from './notifications.mapper.js';

type LiveSink = {
  emitToUser: (userId: string, event: InboxSocketEvent) => void;
};

export type NotifyInput = {
  recipientId: string;
  actorId?: string | null;
  kind: NotificationKind;
  targetType?: string | null;
  targetId?: string | null;
  preview?: string | null;
  href?: string | null;
  payload?: Record<string, unknown>;
  securityKind?: SecurityAlertKind;
  unique?: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger(NotificationsService.name);
  private live: LiveSink | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly queues: QueueService,
  ) {}

  attachRealtime(live: LiveSink): void {
    this.live = live;
  }

  onModuleInit(): void {
    this.queues.attachNotificationHandlers({
      deliver: (id) => this.deliver(id),
      digest: (now) => this.sendDigests(now),
    });
  }

  async notify(input: NotifyInput): Promise<NotificationView | null> {
    if (input.kind !== 'scheduled_post_published' && input.actorId && input.actorId === input.recipientId) {
      return null;
    }
    if (input.actorId && (await this.users.isBlockedEitherWay(input.actorId, input.recipientId))) {
      return null;
    }

    const prefs = await this.prefsFor(input.recipientId);
    const now = new Date();
    const inApp = shouldSendChannel({ prefs, kind: input.kind, channel: 'inApp', now });
    const push = shouldSendChannel({ prefs, kind: input.kind, channel: 'push', now });
    const email = shouldSendChannel({ prefs, kind: input.kind, channel: 'email', now });
    if (!inApp && !push && !email) return null;

    const aggregateKey = aggregateKeyFor({
      kind: input.kind,
      targetId: input.targetId,
      actorId: input.actorId,
      securityKind: input.securityKind,
      unique: input.unique,
    });
    const existing = await this.prisma.notification.findUnique({
      where: { recipientId_aggregateKey: { recipientId: input.recipientId, aggregateKey } },
    });

    let actorIds: string[] = existing ? parseActorIds(existing.actorIds) : [];
    let actorCount = existing?.actorCount ?? 0;
    if (input.actorId) {
      const merged = mergeActors(actorIds, input.actorId, actorCount);
      actorIds = merged.actorIds;
      actorCount = merged.actorCount;
    }

    const actorHandle = input.actorId ? await this.handleOf(input.actorId) : null;
    const href =
      input.href ??
      activityHref({
        kind: input.kind,
        targetId:
          input.kind === 'reply' || input.kind === 'comment' || input.kind === 'mention' || input.kind === 'tag'
            ? typeof input.payload?.postId === 'string'
              ? input.payload.postId
              : input.targetId
            : input.targetId,
        actorHandle,
      });
    const payload = {
      ...(input.payload ?? {}),
      ...(input.securityKind ? { securityKind: input.securityKind } : {}),
    };

    const row = existing
      ? await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            actorIds: actorIds as Prisma.InputJsonValue,
            actorCount,
            preview: input.preview ?? existing.preview,
            href,
            payload: payload as Prisma.InputJsonValue,
            readAt: inApp ? null : existing.readAt,
            updatedAt: now,
          },
        })
      : await this.prisma.notification.create({
          data: {
            recipientId: input.recipientId,
            kind: input.kind,
            aggregateKey,
            actorIds: actorIds as Prisma.InputJsonValue,
            actorCount: Math.max(actorCount, input.actorId ? 1 : 0),
            targetType: input.targetType ?? null,
            targetId: input.targetId ?? null,
            preview: input.preview ?? null,
            href,
            payload: payload as Prisma.InputJsonValue,
            readAt: inApp ? null : now,
          },
        });

    const view = await this.toView(row);
    if (inApp) {
      this.live?.emitToUser(input.recipientId, { type: 'notification.new', notification: view });
    }
    await this.queues.deliverNotification(row.id);
    return view;
  }

  async listActivity(
    userId: string,
    filter: InboxFilter,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotificationPage> {
    const kinds = kindsForInboxFilter(filter);
    if (!kinds) return { items: [], nextCursor: null };
    const prefs = await this.prefsFor(userId);
    const visible = kinds.filter((kind) => prefs.channels[kind].inApp);
    if (visible.length === 0) return { items: [], nextCursor: null };
    const extra = cursor
      ? (() => {
          const { createdAt, id } = decodeCursor(cursor);
          return {
            OR: [{ updatedAt: { lt: createdAt } }, { updatedAt: createdAt, id: { lt: id } }],
          };
        })()
      : undefined;
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: userId, kind: { in: visible }, ...(extra ?? {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const slice = rows.slice(0, limit);
    const items: NotificationView[] = [];
    for (const row of slice) items.push(await this.toView(row));
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async activityBadge(userId: string): Promise<number> {
    const prefs = await this.prefsFor(userId);
    const kinds = (Object.keys(prefs.channels) as NotificationKind[]).filter(
      (kind) => prefs.channels[kind].inApp,
    );
    if (kinds.length === 0) return 0;
    return this.prisma.notification.count({
      where: { recipientId: userId, readAt: null, kind: { in: kinds } },
    });
  }

  async markRead(userId: string, input: MarkNotificationsReadInput): Promise<{ read: number }> {
    if (input.all) {
      const result = await this.prisma.notification.updateMany({
        where: { recipientId: userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { read: result.count };
    }
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, id: { in: input.ids ?? [] }, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: result.count };
  }

  async markKindRead(userId: string, kind: NotificationKind, actorId?: string): Promise<void> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: userId, kind, readAt: null },
    });
    const ids = rows
      .filter((row) => !actorId || parseActorIds(row.actorIds).includes(actorId))
      .map((row) => row.id);
    if (ids.length === 0) return;
    await this.prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { readAt: new Date() },
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return this.prefsFor(userId);
  }

  async setPreferences(userId: string, input: UpdateNotificationPreferencesInput): Promise<NotificationPreferences> {
    const current = await this.ensurePrefsRow(userId);
    const merged = mergeNotificationPreferences(current);
    if (input.channels) {
      for (const [kind, partial] of Object.entries(input.channels)) {
        if (!partial) continue;
        const key = kind as NotificationKind;
        merged.channels[key] = { ...merged.channels[key], ...partial };
      }
    }
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: input.timezone }).format(new Date());
        merged.timezone = input.timezone;
      } catch {
        throw new TesseraHttpError(400, 'VALIDATION', 'Unknown timezone.');
      }
    }
    const row = await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        channels: merged.channels as Prisma.InputJsonValue,
        quietHoursEnabled: input.quietHoursEnabled ?? merged.quietHoursEnabled,
        quietHoursStartMinutes: input.quietHoursStartMinutes ?? merged.quietHoursStartMinutes,
        quietHoursEndMinutes: input.quietHoursEndMinutes ?? merged.quietHoursEndMinutes,
        timezone: merged.timezone,
        emailDigest: input.emailDigest ?? merged.emailDigest,
      },
    });
    return mergeNotificationPreferences(row);
  }

  async registerDevice(userId: string, input: RegisterDeviceInput): Promise<DeviceView> {
    const row = await this.prisma.device.upsert({
      where: { userId_token: { userId, token: input.token } },
      create: {
        userId,
        platform: input.platform,
        token: input.token,
        keys: input.keys ? (input.keys as Prisma.InputJsonValue) : undefined,
        userAgent: input.userAgent ?? null,
      },
      update: {
        platform: input.platform,
        keys: input.keys ? (input.keys as Prisma.InputJsonValue) : undefined,
        userAgent: input.userAgent ?? null,
        lastSeenAt: new Date(),
      },
    });
    return this.toDevice(row);
  }

  async listDevices(userId: string): Promise<{ items: DeviceView[] }> {
    const rows = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return { items: rows.map((row) => this.toDevice(row)) };
  }

  async removeDevice(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.device.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) throw new TesseraHttpError(404, 'NOT_FOUND', 'Device not found.');
  }

  vapidPublic(): { publicKey: string | null; configured: boolean } {
    return { publicKey: vapidPublicKey(), configured: vapidConfigured() };
  }

  async deliver(notificationId: string): Promise<void> {
    await deliverNotificationRecord(this.prisma, notificationId, {
      mail: {
        sendActivity: (to, subject, body, href) => this.mail.sendActivity(to, subject, body, href),
        sendSecurity: (to, body) => this.mail.sendSecurityAlert(to, body),
      },
      sendWebPush,
      log: {
        info: (obj, msg) => this.log.log({ ...obj, msg }),
        warn: (obj, msg) => this.log.warn({ ...obj, msg }),
        error: (obj, msg) => this.log.error({ ...obj, msg }),
      },
    });
  }

  async sendDigests(now = new Date()): Promise<{ sent: number }> {
    return sendNotificationDigests(
      this.prisma,
      now,
      (to, lines) => this.mail.sendActivityDigest(to, lines),
      {
        info: (obj, msg) => this.log.log({ ...obj, msg }),
        warn: (obj, msg) => this.log.warn({ ...obj, msg }),
        error: (obj, msg) => this.log.error({ ...obj, msg }),
      },
    );
  }

  private async toView(row: {
    id: string;
    kind: NotificationKind;
    actorIds: Prisma.JsonValue;
    actorCount: number;
    targetType: string | null;
    targetId: string | null;
    preview: string | null;
    href: string | null;
    payload: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<NotificationView> {
    const ids = parseActorIds(row.actorIds);
    const actors: AuthorPreview[] = [];
    if (ids.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        include: { profile: true },
      });
      for (const id of ids) {
        const user = users.find((item) => item.id === id);
        if (!user) continue;
        actors.push({
          id: user.id,
          handle: user.handle,
          displayName: user.profile?.displayName ?? user.handle,
          avatarUrl: await this.storage.signGet(user.profile?.avatarKey ?? null),
        });
      }
    }
    return toNotificationView({ ...row, actors });
  }

  private async prefsFor(userId: string): Promise<NotificationPreferences> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!row) return defaultNotificationPreferences();
    return mergeNotificationPreferences(row);
  }

  private async ensurePrefsRow(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) return existing;
    const defaults = defaultNotificationPreferences();
    return this.prisma.notificationPreference.create({
      data: {
        userId,
        channels: defaults.channels as Prisma.InputJsonValue,
        quietHoursEnabled: defaults.quietHoursEnabled,
        quietHoursStartMinutes: defaults.quietHoursStartMinutes,
        quietHoursEndMinutes: defaults.quietHoursEndMinutes,
        timezone: defaults.timezone,
        emailDigest: defaults.emailDigest,
      },
    });
  }

  private async handleOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
    return user?.handle ?? null;
  }

  private toDevice(row: {
    id: string;
    platform: 'expo' | 'web_push';
    token: string;
    createdAt: Date;
    lastSeenAt: Date;
  }): DeviceView {
    const preview = row.token.length <= 12 ? row.token : `${row.token.slice(0, 8)}…${row.token.slice(-4)}`;
    return {
      id: row.id,
      platform: row.platform,
      tokenPreview: preview,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    };
  }
}

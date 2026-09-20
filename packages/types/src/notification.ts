import type { AuthorPreview } from './post';

export const NOTIFICATION_KINDS = [
  'new_follower',
  'follow_request',
  'appreciation',
  'comment',
  'reply',
  'mention',
  'tag',
  'moment_reaction',
  'board_invite',
  'scheduled_post_published',
  'security_alert',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DEVICE_PLATFORMS = ['expo', 'web_push'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const SECURITY_ALERT_KINDS = ['password_changed', 'totp_enabled', 'totp_disabled'] as const;
export type SecurityAlertKind = (typeof SECURITY_ALERT_KINDS)[number];

export type ChannelPref = {
  inApp: boolean;
  push: boolean;
  email: boolean;
};

export type NotificationChannelMap = Record<NotificationKind, ChannelPref>;

export type NotificationPreferences = {
  channels: NotificationChannelMap;
  quietHoursEnabled: boolean;
  /** Minutes from local midnight, 0–1439. */
  quietHoursStartMinutes: number;
  quietHoursEndMinutes: number;
  timezone: string;
  emailDigest: boolean;
};

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  body: string;
  actors: AuthorPreview[];
  actorCount: number;
  targetType: string | null;
  targetId: string | null;
  preview: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPage = {
  items: NotificationView[];
  nextCursor: string | null;
};

export type DeviceView = {
  id: string;
  platform: DevicePlatform;
  tokenPreview: string;
  createdAt: string;
  lastSeenAt: string;
};

export type InboxBadge = {
  unreadMessages: number;
  pendingRequests: number;
  unreadActivity: number;
};

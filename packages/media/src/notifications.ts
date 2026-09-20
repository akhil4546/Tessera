import {
  NOTIFICATION_KINDS,
  type ChannelPref,
  type InboxFilter,
  type NotificationChannel,
  type NotificationChannelMap,
  type NotificationKind,
  type NotificationPreferences,
  type SecurityAlertKind,
} from '@tessera/types';

export const MAX_STORED_ACTORS = 3;
export const DEFAULT_QUIET_START_MINUTES = 22 * 60;
export const DEFAULT_QUIET_END_MINUTES = 7 * 60;

const DEFAULT_CHANNEL: ChannelPref = { inApp: true, push: true, email: false };

export const DEFAULT_CHANNEL_PREFS: NotificationChannelMap = {
  new_follower: { inApp: true, push: true, email: false },
  follow_request: { inApp: true, push: true, email: true },
  appreciation: { inApp: true, push: true, email: false },
  comment: { inApp: true, push: true, email: false },
  reply: { inApp: true, push: true, email: false },
  mention: { inApp: true, push: true, email: true },
  tag: { inApp: true, push: true, email: true },
  moment_reaction: { inApp: true, push: true, email: false },
  board_invite: { inApp: true, push: true, email: true },
  scheduled_post_published: { inApp: true, push: true, email: true },
  security_alert: { inApp: true, push: true, email: true },
};

export const ACTIVITY_FILTER_KINDS: Record<'mentions' | 'appreciations' | 'follows', NotificationKind[]> = {
  mentions: ['mention', 'tag'],
  appreciations: ['appreciation', 'moment_reaction'],
  follows: ['new_follower', 'follow_request'],
};

const VERB: Record<NotificationKind, string> = {
  new_follower: 'followed you',
  follow_request: 'asked to follow you',
  appreciation: 'appreciated your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you',
  tag: 'tagged you',
  moment_reaction: 'reacted to your Moment',
  board_invite: 'invited you to a Board',
  scheduled_post_published: 'Your scheduled post is live',
  security_alert: 'Security alert',
};

const SECURITY_COPY: Record<SecurityAlertKind, string> = {
  password_changed: 'Your Tessera password was changed.',
  totp_enabled: 'Two-factor authentication is now on.',
  totp_disabled: 'Two-factor authentication was turned off.',
};

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    channels: { ...DEFAULT_CHANNEL_PREFS },
    quietHoursEnabled: false,
    quietHoursStartMinutes: DEFAULT_QUIET_START_MINUTES,
    quietHoursEndMinutes: DEFAULT_QUIET_END_MINUTES,
    timezone: 'UTC',
    emailDigest: false,
  };
}

export function mergeChannelPrefs(stored: unknown): NotificationChannelMap {
  const source =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const out = { ...DEFAULT_CHANNEL_PREFS };
  for (const kind of NOTIFICATION_KINDS) {
    const row = source[kind];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const partial = row as Partial<ChannelPref>;
    out[kind] = {
      inApp: typeof partial.inApp === 'boolean' ? partial.inApp : DEFAULT_CHANNEL_PREFS[kind].inApp,
      push: typeof partial.push === 'boolean' ? partial.push : DEFAULT_CHANNEL_PREFS[kind].push,
      email: typeof partial.email === 'boolean' ? partial.email : DEFAULT_CHANNEL_PREFS[kind].email,
    };
  }
  return out;
}

export function mergeNotificationPreferences(stored: {
  channels: unknown;
  quietHoursEnabled: boolean;
  quietHoursStartMinutes: number;
  quietHoursEndMinutes: number;
  timezone: string;
  emailDigest: boolean;
}): NotificationPreferences {
  return {
    channels: mergeChannelPrefs(stored.channels),
    quietHoursEnabled: stored.quietHoursEnabled,
    quietHoursStartMinutes: stored.quietHoursStartMinutes,
    quietHoursEndMinutes: stored.quietHoursEndMinutes,
    timezone: stored.timezone || 'UTC',
    emailDigest: stored.emailDigest,
  };
}

export function aggregateKeyFor(input: {
  kind: NotificationKind;
  targetId?: string | null;
  actorId?: string | null;
  securityKind?: SecurityAlertKind | null;
  unique?: string | null;
}): string {
  switch (input.kind) {
    case 'new_follower':
      return 'new_follower';
    case 'follow_request':
      return `follow_request:${input.actorId ?? 'unknown'}`;
    case 'appreciation':
      return `appreciation:${input.targetId ?? 'unknown'}`;
    case 'comment':
      return `comment:${input.targetId ?? 'unknown'}`;
    case 'reply':
      return `reply:${input.targetId ?? 'unknown'}`;
    case 'mention':
      return `mention:${input.targetId ?? 'unknown'}`;
    case 'tag':
      return `tag:${input.targetId ?? 'unknown'}`;
    case 'moment_reaction':
      return `moment_reaction:${input.targetId ?? 'unknown'}`;
    case 'board_invite':
      return `board_invite:${input.targetId ?? 'unknown'}`;
    case 'scheduled_post_published':
      return `scheduled_post:${input.targetId ?? 'unknown'}`;
    case 'security_alert':
      return `security:${input.securityKind ?? 'alert'}:${input.unique ?? Date.now().toString()}`;
    default:
      return `${input.kind}:${input.targetId ?? 'unknown'}`;
  }
}

export function mergeActors(
  existing: string[],
  actorId: string,
  existingCount: number,
): { actorIds: string[]; actorCount: number; isNew: boolean } {
  const isNew = !existing.includes(actorId);
  const actorIds = [actorId, ...existing.filter((id) => id !== actorId)].slice(0, MAX_STORED_ACTORS);
  return {
    actorIds,
    actorCount: isNew ? existingCount + 1 : Math.max(existingCount, 1),
    isNew,
  };
}

export function parseActorIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function formatActivityCopy(input: {
  kind: NotificationKind;
  actors: { displayName: string }[];
  actorCount: number;
  securityKind?: SecurityAlertKind | null;
}): string {
  if (input.kind === 'security_alert') {
    return SECURITY_COPY[input.securityKind ?? 'password_changed'];
  }
  if (input.kind === 'scheduled_post_published') {
    return 'Your scheduled post is live.';
  }
  const first = input.actors[0]?.displayName ?? 'Someone';
  const verb = VERB[input.kind];
  if (input.actorCount <= 1) return `${first} ${verb}.`;
  if (input.actorCount === 2) {
    const second = input.actors[1]?.displayName ?? '1 other';
    return `${first} and ${second} ${verb}.`;
  }
  return `${first} and ${input.actorCount - 1} others ${verb}.`;
}

export function minutesInTimeZone(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function inQuietHours(
  now: Date,
  prefs: Pick<NotificationPreferences, 'quietHoursEnabled' | 'quietHoursStartMinutes' | 'quietHoursEndMinutes' | 'timezone'>,
): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const start = prefs.quietHoursStartMinutes;
  const end = prefs.quietHoursEndMinutes;
  if (start === end) return false;
  const minutes = minutesInTimeZone(now, prefs.timezone);
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

export function shouldSendChannel(input: {
  prefs: NotificationPreferences;
  kind: NotificationKind;
  channel: NotificationChannel;
  now?: Date;
}): boolean {
  const pref = input.prefs.channels[input.kind] ?? DEFAULT_CHANNEL;
  if (input.kind === 'security_alert' && input.channel === 'email') return true;
  if (!pref[input.channel]) return false;
  if (input.channel === 'inApp') return true;
  const quiet = inQuietHours(input.now ?? new Date(), input.prefs);
  if (quiet && input.kind !== 'security_alert') return false;
  if (input.channel === 'email' && input.prefs.emailDigest && input.kind !== 'security_alert') {
    return false;
  }
  return true;
}

export function kindsForInboxFilter(filter: InboxFilter): NotificationKind[] | null {
  if (filter === 'messages' || filter === 'requests') return null;
  if (filter === 'all') return [...NOTIFICATION_KINDS];
  return ACTIVITY_FILTER_KINDS[filter];
}

export function activityHref(input: {
  kind: NotificationKind;
  targetId?: string | null;
  actorHandle?: string | null;
}): string | null {
  switch (input.kind) {
    case 'new_follower':
      return input.actorHandle ? `/u/${input.actorHandle}` : null;
    case 'follow_request':
      return '/settings/requests';
    case 'appreciation':
    case 'comment':
    case 'reply':
    case 'mention':
    case 'tag':
      return input.targetId ? `/p/${input.targetId}` : null;
    case 'moment_reaction':
      return input.actorHandle ? `/u/${input.actorHandle}` : '/';
    case 'security_alert':
      return '/settings/security';
    case 'board_invite':
      return input.targetId ? `/boards/${input.targetId}` : '/boards';
    case 'scheduled_post_published':
      return input.targetId ? `/p/${input.targetId}` : null;
    default:
      return null;
  }
}

export function digestHourMatches(now: Date, timeZone: string, hour = 9): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    return Number(parts.find((part) => part.type === 'hour')?.value ?? -1) === hour;
  } catch {
    return now.getUTCHours() === hour;
  }
}

export function localDayKey(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

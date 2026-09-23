import { describe, expect, it } from 'vitest';
import {
  aggregateKeyFor,
  defaultNotificationPreferences,
  digestHourMatches,
  formatActivityCopy,
  inQuietHours,
  kindsForInboxFilter,
  mergeActors,
  mergeChannelPrefs,
  minutesInTimeZone,
  shouldSendChannel,
} from './notifications.ts';

describe('aggregation keys', () => {
  it('collapses appreciations on the same post and keeps follow requests distinct', () => {
    expect(aggregateKeyFor({ kind: 'appreciation', targetId: 'post-1' })).toBe(
      'appreciation:post-1',
    );
    expect(aggregateKeyFor({ kind: 'new_follower', actorId: 'a' })).toBe('new_follower');
    expect(aggregateKeyFor({ kind: 'follow_request', actorId: 'june' })).toBe(
      'follow_request:june',
    );
    expect(aggregateKeyFor({ kind: 'follow_request', actorId: 'omar' })).toBe(
      'follow_request:omar',
    );
    expect(
      aggregateKeyFor({ kind: 'security_alert', securityKind: 'password_changed', unique: 'tok' }),
    ).toBe('security:password_changed:tok');
  });
});

describe('actor merge', () => {
  it('prepends a new actor and caps stored ids at 3', () => {
    const first = mergeActors([], 'asha', 0);
    expect(first).toEqual({ actorIds: ['asha'], actorCount: 1, isNew: true });
    const second = mergeActors(['asha'], 'ravi', 1);
    expect(second.actorCount).toBe(2);
    expect(second.actorIds[0]).toBe('ravi');
    const third = mergeActors(['ravi', 'asha'], 'nia', 2);
    expect(third.actorIds).toEqual(['nia', 'ravi', 'asha']);
    expect(third.actorCount).toBe(3);
    const fourth = mergeActors(['nia', 'ravi', 'asha'], 'mara', 3);
    expect(fourth.actorIds).toEqual(['mara', 'nia', 'ravi']);
    expect(fourth.actorCount).toBe(4);
    const again = mergeActors(['mara', 'nia', 'ravi'], 'nia', 4);
    expect(again.isNew).toBe(false);
    expect(again.actorCount).toBe(4);
    expect(again.actorIds[0]).toBe('nia');
  });
});

describe('activity copy', () => {
  it('matches “Asha and 12 others appreciated your post”', () => {
    expect(
      formatActivityCopy({
        kind: 'appreciation',
        actors: [{ displayName: 'Asha' }],
        actorCount: 1,
      }),
    ).toBe('Asha appreciated your post.');
    expect(
      formatActivityCopy({
        kind: 'appreciation',
        actors: [{ displayName: 'Asha' }, { displayName: 'Ravi' }],
        actorCount: 2,
      }),
    ).toBe('Asha and Ravi appreciated your post.');
    expect(
      formatActivityCopy({
        kind: 'appreciation',
        actors: [{ displayName: 'Asha' }],
        actorCount: 13,
      }),
    ).toBe('Asha and 12 others appreciated your post.');
    expect(
      formatActivityCopy({
        kind: 'security_alert',
        actors: [],
        actorCount: 0,
        securityKind: 'password_changed',
      }),
    ).toBe('Your Tessera password was changed.');
  });
});

describe('quiet hours and channels', () => {
  it('wraps midnight and skips push/email but not in-app', () => {
    const prefs = defaultNotificationPreferences();
    prefs.quietHoursEnabled = true;
    prefs.quietHoursStartMinutes = 22 * 60;
    prefs.quietHoursEndMinutes = 7 * 60;
    prefs.timezone = 'UTC';
    const late = new Date('2026-09-18T23:15:00.000Z');
    const morning = new Date('2026-09-18T08:00:00.000Z');
    expect(inQuietHours(late, prefs)).toBe(true);
    expect(inQuietHours(morning, prefs)).toBe(false);
    expect(shouldSendChannel({ prefs, kind: 'appreciation', channel: 'inApp', now: late })).toBe(
      true,
    );
    expect(shouldSendChannel({ prefs, kind: 'appreciation', channel: 'push', now: late })).toBe(
      false,
    );
    expect(shouldSendChannel({ prefs, kind: 'appreciation', channel: 'email', now: late })).toBe(
      false,
    );
    expect(shouldSendChannel({ prefs, kind: 'security_alert', channel: 'email', now: late })).toBe(
      true,
    );
    expect(shouldSendChannel({ prefs, kind: 'security_alert', channel: 'push', now: late })).toBe(
      true,
    );
  });

  it('holds non-security email when a digest is on', () => {
    const prefs = defaultNotificationPreferences();
    prefs.emailDigest = true;
    expect(shouldSendChannel({ prefs, kind: 'mention', channel: 'email' })).toBe(false);
    expect(shouldSendChannel({ prefs, kind: 'mention', channel: 'push' })).toBe(true);
    expect(shouldSendChannel({ prefs, kind: 'security_alert', channel: 'email' })).toBe(true);
  });

  it('always emails security even if the stored pref is off', () => {
    const prefs = defaultNotificationPreferences();
    prefs.channels.security_alert = { inApp: true, push: false, email: false };
    expect(shouldSendChannel({ prefs, kind: 'security_alert', channel: 'email' })).toBe(true);
    expect(shouldSendChannel({ prefs, kind: 'security_alert', channel: 'push' })).toBe(false);
  });
});

describe('minutes in a timezone', () => {
  it('reads 23:15 in UTC', () => {
    expect(minutesInTimeZone(new Date('2026-09-18T23:15:00.000Z'), 'UTC')).toBe(23 * 60 + 15);
  });
});

describe('inbox filters', () => {
  it('maps Mentions / Appreciations / Follows to kinds, and Messages to threads only', () => {
    expect(kindsForInboxFilter('messages')).toBeNull();
    expect(kindsForInboxFilter('requests')).toBeNull();
    expect(kindsForInboxFilter('mentions')).toEqual(['mention', 'tag']);
    expect(kindsForInboxFilter('appreciations')).toEqual(['appreciation', 'moment_reaction']);
    expect(kindsForInboxFilter('follows')).toEqual(['new_follower', 'follow_request']);
    expect(kindsForInboxFilter('all')?.includes('security_alert')).toBe(true);
  });
});

describe('channel pref merge', () => {
  it('fills missing kinds from defaults', () => {
    const merged = mergeChannelPrefs({ appreciation: { push: false } });
    expect(merged.appreciation.push).toBe(false);
    expect(merged.appreciation.inApp).toBe(true);
    expect(merged.mention.email).toBe(true);
  });
});

describe('digest hour', () => {
  it('fires at 09:00 UTC', () => {
    expect(digestHourMatches(new Date('2026-09-18T09:05:00.000Z'), 'UTC', 9)).toBe(true);
    expect(digestHourMatches(new Date('2026-09-18T10:05:00.000Z'), 'UTC', 9)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { markNotificationsReadSchema, registerDeviceSchema, updateNotificationPreferencesSchema } from './notification';

describe('updateNotificationPreferencesSchema', () => {
  it('needs at least one field and accepts a partial channel map', () => {
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(false);
    expect(
      updateNotificationPreferencesSchema.safeParse({
        channels: { appreciation: { push: false } },
        quietHoursEnabled: true,
        timezone: 'Europe/Amsterdam',
      }).success,
    ).toBe(true);
  });
});

describe('registerDeviceSchema', () => {
  it('requires web push keys and an Expo token', () => {
    expect(registerDeviceSchema.safeParse({ platform: 'expo', token: 'ExponentPushToken[abc]' }).success).toBe(true);
    expect(registerDeviceSchema.safeParse({ platform: 'web_push', token: 'https://fcm.googleapis.com/x' }).success).toBe(
      false,
    );
    expect(
      registerDeviceSchema.safeParse({
        platform: 'web_push',
        token: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'aaaaaaaa', auth: 'bbbb' },
      }).success,
    ).toBe(true);
  });
});

describe('markNotificationsReadSchema', () => {
  it('accepts all or a list of ids', () => {
    expect(markNotificationsReadSchema.safeParse({}).success).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ all: true }).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: ['n1'] }).success).toBe(true);
  });
});

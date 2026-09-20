import { z } from 'zod';
import {
  DEVICE_PLATFORMS,
  INBOX_FILTERS,
  NOTIFICATION_KINDS,
} from '@tessera/types';

export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS);

export const channelPrefSchema = z.object({
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
});

export const updateNotificationPreferencesSchema = z
  .object({
    channels: z.record(notificationKindSchema, channelPrefSchema.partial()).optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStartMinutes: z.number().int().min(0).max(1439).optional(),
    quietHoursEndMinutes: z.number().int().min(0).max(1439).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    emailDigest: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const registerDeviceSchema = z
  .object({
    platform: devicePlatformSchema,
    token: z.string().trim().min(8).max(2000),
    keys: z
      .object({
        p256dh: z.string().trim().min(8).max(500),
        auth: z.string().trim().min(4).max(200),
      })
      .optional(),
    userAgent: z.string().trim().max(400).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.platform === 'web_push' && !value.keys) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Web Push needs p256dh and auth keys.' });
    }
  });

export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.all) || (value.ids && value.ids.length > 0), {
    message: 'Choose notifications to mark read.',
  });

export const activityQuerySchema = z.object({
  filter: z.enum(INBOX_FILTERS).default('all'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type UpdateNotificationPreferencesInput = z.output<typeof updateNotificationPreferencesSchema>;
export type RegisterDeviceInput = z.output<typeof registerDeviceSchema>;
export type MarkNotificationsReadInput = z.output<typeof markNotificationsReadSchema>;

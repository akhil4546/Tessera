import { z } from 'zod';
import { authenticitySchema } from './post';
import { audienceFields, refineAudience } from './audience';

export const MAX_LOOP_DURATION_MS = 90_000;
export const MAX_LOOP_CLIPS = 10;
export const MAX_LOOP_OVERLAYS = 8;
export const MAX_OVERLAY_TEXT = 80;
export const LOOP_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
export const BUDGET_EXTEND_MINUTES = 10;
export const MIN_LOOP_BUDGET_MINUTES = 5;
export const MAX_LOOP_BUDGET_MINUTES = 180;
export const MAX_WATCH_HEARTBEAT_SECONDS = 30;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour like #F4EDE3');

export const loopSpeedSchema = z.union([
  z.literal(0.5),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
  z.literal(3),
]);

export const loopClipInputSchema = z
  .object({
    mediaId: z.string().min(1),
    trimStartMs: z.number().int().min(0).default(0),
    trimEndMs: z.number().int().positive(),
    speed: loopSpeedSchema.default(1),
  })
  .refine((value) => value.trimEndMs > value.trimStartMs, {
    message: 'Clip trim end must be after the start.',
  });

export const loopOverlaySchema = z.object({
  text: z.string().trim().min(1).max(MAX_OVERLAY_TEXT),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  rotation: z.number().min(-180).max(180).default(0),
  scale: z.number().min(0.2).max(4).default(1),
  startMs: z.number().int().min(0).default(0),
  endMs: z.number().int().positive().nullable().default(null),
  color: hexColor.default('#F4EDE3'),
});

export const createLoopSchema = z
  .object({
    clips: z.array(loopClipInputSchema).min(1).max(MAX_LOOP_CLIPS),
    coverFrameMs: z.number().int().min(0).default(0),
    overlays: z.array(loopOverlaySchema).max(MAX_LOOP_OVERLAYS).default([]),
    audioTrackId: z.string().min(1).optional(),
    allowAudioReuse: z.boolean().default(true),
    altText: z.string().max(1000).default(''),
    caption: z.string().max(2200).default(''),
    locationName: z.string().trim().max(120).nullable().optional(),
    authenticity: authenticitySchema,
    ...audienceFields,
    commentsEnabled: z.boolean().default(true),
    publicAppreciationCounts: z.boolean().default(false),
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine(refineAudience);

export const updateLoopSchema = z
  .object({
    allowAudioReuse: z.boolean().optional(),
    coverFrameMs: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const loopsFeedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export const watchLoopSchema = z.object({
  seconds: z.number().int().min(1).max(MAX_WATCH_HEARTBEAT_SECONDS),
});

export const wellbeingUpdateSchema = z
  .object({
    loopsBudgetMinutes: z
      .number()
      .int()
      .min(MIN_LOOP_BUDGET_MINUTES)
      .max(MAX_LOOP_BUDGET_MINUTES)
      .nullable()
      .optional(),
    dailyReminderMinutes: z.number().int().min(15).max(720).nullable().optional(),
    sessionNudgeMinutes: z.number().int().min(15).max(240).nullable().optional(),
  })
  .refine(
    (value) =>
      value.loopsBudgetMinutes !== undefined ||
      value.dailyReminderMinutes !== undefined ||
      value.sessionNudgeMinutes !== undefined,
    { message: 'No changes' },
  );

export const audioQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(80).optional(),
});

export type CreateLoopInput = z.output<typeof createLoopSchema>;
export type UpdateLoopInput = z.output<typeof updateLoopSchema>;
export type LoopClipInput = z.output<typeof loopClipInputSchema>;
export type LoopOverlayInput = z.output<typeof loopOverlaySchema>;

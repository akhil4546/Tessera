import { z } from 'zod';
import { QUICK_EMOJIS } from '@tessera/types';
import { audienceFields, refineAudience } from './audience';

export const MAX_MOMENT_SEGMENTS = 20;
export const MIN_STILL_DURATION_MS = 1_000;
export const MAX_STILL_DURATION_MS = 15_000;
export const DEFAULT_STILL_DURATION_MS = 5_000;
export const MAX_REEL_SHELVES = 20;
export const MAX_SHELF_ITEMS = 60;
export const MAX_SHELF_TITLE = 40;

export const momentVisibilitySchema = z.enum(['public', 'followers', 'circles']);

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour like #F4EDE3');

const stickerTransform = {
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  rotation: z.number().min(-180).max(180).default(0),
  scale: z.number().min(0.2).max(4).default(1),
};

const textStickerSchema = z.object({
  kind: z.literal('text'),
  ...stickerTransform,
  payload: z.object({
    text: z.string().trim().min(1).max(200),
    color: hexColor.default('#F4EDE3'),
    align: z.enum(['left', 'center', 'right']).default('center'),
  }),
});

const drawingStickerSchema = z.object({
  kind: z.literal('drawing'),
  ...stickerTransform,
  payload: z.object({
    paths: z
      .array(
        z.object({
          color: hexColor,
          width: z.number().min(1).max(32),
          points: z
            .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
            .min(2)
            .max(2000),
        }),
      )
      .min(1)
      .max(40),
  }),
});

const mentionStickerSchema = z.object({
  kind: z.literal('mention'),
  ...stickerTransform,
  payload: z.object({ handle: z.string().trim().min(2).max(30) }),
});

const locationStickerSchema = z.object({
  kind: z.literal('location'),
  ...stickerTransform,
  payload: z.object({ name: z.string().trim().min(1).max(120) }),
});

const hashtagStickerSchema = z.object({
  kind: z.literal('hashtag'),
  ...stickerTransform,
  payload: z.object({ tag: z.string().trim().min(1).max(50) }),
});

const pollStickerSchema = z.object({
  kind: z.literal('poll'),
  ...stickerTransform,
  payload: z.object({
    prompt: z.string().trim().min(1).max(80),
    options: z.array(z.string().trim().min(1).max(40)).min(2).max(4),
  }),
});

const questionStickerSchema = z.object({
  kind: z.literal('question'),
  ...stickerTransform,
  payload: z.object({ prompt: z.string().trim().min(1).max(80) }),
});

const countdownStickerSchema = z.object({
  kind: z.literal('countdown'),
  ...stickerTransform,
  payload: z.object({ endsAt: z.string().datetime() }),
});

const linkStickerSchema = z.object({
  kind: z.literal('link'),
  ...stickerTransform,
  payload: z.object({
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//i.test(value), 'Links must be http or https'),
    label: z.string().trim().min(1).max(40).optional(),
  }),
});

export const momentStickerInputSchema = z.discriminatedUnion('kind', [
  textStickerSchema,
  drawingStickerSchema,
  mentionStickerSchema,
  locationStickerSchema,
  hashtagStickerSchema,
  pollStickerSchema,
  questionStickerSchema,
  countdownStickerSchema,
  linkStickerSchema,
]);

export const momentSegmentInputSchema = z.object({
  mediaId: z.string().min(1),
  durationMs: z.number().int().min(MIN_STILL_DURATION_MS).max(MAX_STILL_DURATION_MS).optional(),
  altText: z.string().max(1000).default(''),
  stickers: z.array(momentStickerInputSchema).max(12).default([]),
});

export const createMomentSchema = z
  .object({
    segments: z.array(momentSegmentInputSchema).min(1).max(MAX_MOMENT_SEGMENTS),
    ...audienceFields,
  })
  .superRefine(refineAudience);

export const keepMomentSchema = z
  .object({
    shelfId: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(MAX_SHELF_TITLE).optional(),
  })
  .refine((value) => Boolean(value.shelfId || value.title), {
    message: 'Pick a Reel Shelf or name a new one.',
  });

export const createReelShelfSchema = z.object({
  title: z.string().trim().min(1).max(MAX_SHELF_TITLE),
});

export const updateReelShelfSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_SHELF_TITLE).optional(),
    coverMediaId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const reelShelfOrderSchema = z.object({
  shelfIds: z.array(z.string().min(1)).min(1).max(MAX_REEL_SHELVES),
});

export const momentReactionSchema = z.object({
  emoji: z.string().min(1).max(8).refine((value) => (QUICK_EMOJIS as readonly string[]).includes(value), {
    message: 'Pick one of Tessera’s quick reactions.',
  }),
});

export const stickerResponseSchema = z.union([
  z.object({ optionIndex: z.number().int().min(0).max(3) }),
  z.object({ text: z.string().trim().min(1).max(200) }),
]);

export type CreateMomentInput = z.output<typeof createMomentSchema>;
export type MomentStickerInput = z.output<typeof momentStickerInputSchema>;
export type KeepMomentInput = z.output<typeof keepMomentSchema>;
export type StickerResponseInput = z.output<typeof stickerResponseSchema>;

import { z } from 'zod';
import { audienceFields, refineAudience } from './audience';

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const AUDIO_MIME = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac'] as const;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export const MAX_CAROUSEL = 10;

export const cropAspectSchema = z.enum(['original', 'square', 'portrait', 'landscape']);
export const authenticitySchema = z.enum(['unfiltered', 'edited', 'ai_generated']);
export const appreciationKindSchema = z.enum(['inspiring', 'funny', 'love', 'useful']);
export const postVisibilitySchema = z.enum(['public', 'followers', 'circles']);
export const mediaKindSchema = z.enum(['image', 'video', 'audio']);
export const mediaPurposeSchema = z.enum(['post', 'avatar', 'moment', 'loop', 'message']);

export const adjustmentsSchema = z.object({
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  warmth: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-100).max(100).default(0),
  fade: z.number().min(0).max(100).default(0),
  vignette: z.number().min(0).max(100).default(0),
  sharpen: z.number().min(0).max(100).default(0),
});

export const mediaIntentSchema = z
  .object({
    purpose: mediaPurposeSchema.default('post'),
    kind: mediaKindSchema,
    mimeType: z.string().min(1).max(100),
    byteSize: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const allowed =
      value.kind === 'image' ? IMAGE_MIME : value.kind === 'audio' ? AUDIO_MIME : VIDEO_MIME;
    if (!(allowed as readonly string[]).includes(value.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported type ${value.mimeType}. Images: jpeg/png/webp. Video: mp4/mov/webm. Voice: webm/mp4/mpeg/ogg.`,
      });
    }
    const max =
      value.purpose === 'avatar'
        ? MAX_AVATAR_BYTES
        : value.kind === 'image'
          ? MAX_IMAGE_BYTES
          : value.kind === 'audio'
            ? MAX_VOICE_BYTES
            : MAX_VIDEO_BYTES;
    if (value.byteSize > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `File is too large (max ${max} bytes).` });
    }
    if (value.purpose === 'avatar' && value.kind !== 'image') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Avatars must be images.' });
    }
    if (value.kind === 'audio' && value.purpose !== 'message') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Voice notes belong in messages.' });
    }
  });

export const peopleTagInputSchema = z.object({
  handle: z.string().min(2).max(30),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const postMediaInputSchema = z.object({
  id: z.string().min(1),
  altText: z.string().max(1000).default(''),
  crop: cropAspectSchema.default('original'),
  filterId: z.string().min(1).max(32).default('none'),
  adjustments: adjustmentsSchema.default({
    brightness: 0,
    contrast: 0,
    warmth: 0,
    saturation: 0,
    fade: 0,
    vignette: 0,
    sharpen: 0,
  }),
  peopleTags: z.array(peopleTagInputSchema).max(20).default([]),
});

export const createPostSchema = z
  .object({
    media: z.array(postMediaInputSchema).min(1).max(MAX_CAROUSEL),
    caption: z.string().max(2200).default(''),
    locationName: z.string().trim().max(120).nullable().optional(),
    authenticity: authenticitySchema,
    ...audienceFields,
    commentsEnabled: z.boolean().default(true),
    publicAppreciationCounts: z.boolean().default(false),
    sensitive: z.boolean().default(false),
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine(refineAudience);

export const updatePostSchema = z
  .object({
    caption: z.string().max(2200).optional(),
    locationName: z.string().trim().max(120).nullable().optional(),
    commentsEnabled: z.boolean().optional(),
    publicAppreciationCounts: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    altText: z.array(z.object({ mediaId: z.string(), altText: z.string().max(1000) })).optional(),
    peopleTags: z
      .array(z.object({ mediaId: z.string(), tags: z.array(peopleTagInputSchema).max(20) }))
      .optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const appreciateSchema = z.object({
  type: appreciationKindSchema,
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().min(1).optional(),
});

export const commentFilterSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(40)).max(50),
});

export const heroTilesSchema = z.object({
  postIds: z.array(z.string().min(1)).max(3),
});

export const avatarSchema = z.object({
  mediaId: z.string().min(1),
});

export const followingFeedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  keepGoing: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1')
    .default(false),
});

export const mosaicQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export type CreatePostInput = z.output<typeof createPostSchema>;
export type UpdatePostInput = z.output<typeof updatePostSchema>;
export type MediaIntentInput = z.output<typeof mediaIntentSchema>;

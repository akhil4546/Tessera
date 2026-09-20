import { z } from 'zod';

export const rankingWeightsSchema = z.object({
  peopleIInteractWith: z.number().min(0).max(1),
  newCreators: z.number().min(0).max(1),
  nearby: z.number().min(0).max(1),
  lessVideo: z.number().min(0).max(1),
});

export const updateRankingSchema = rankingWeightsSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'No changes',
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  tab: z.enum(['all', 'people', 'hashtags', 'places', 'captions', 'boards']).default('all'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const discoverFeedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(18),
  topic: z
    .string()
    .trim()
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/)
    .optional(),
});

export const hashtagQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['top', 'recent']).default('top'),
});

export const placeQuerySchema = hashtagQuerySchema;

export const hashtagParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((value) => value.replace(/^#/, '').toLowerCase())
  .refine((value) => /^[a-z][a-z0-9_]{0,49}$/.test(value), 'Invalid hashtag');

export type RankingWeightsInput = z.infer<typeof rankingWeightsSchema>;
export type UpdateRankingInput = z.infer<typeof updateRankingSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type DiscoverFeedQuery = z.infer<typeof discoverFeedQuerySchema>;

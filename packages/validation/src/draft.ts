import { z } from 'zod';

export const MAX_DRAFTS_PER_USER = 40;

export const draftKindSchema = z.enum(['post', 'loop', 'moment']);

export const createDraftSchema = z.object({
  kind: draftKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const updateDraftSchema = z
  .object({
    kind: draftKindSchema.optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const draftsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  kind: draftKindSchema.optional(),
});

export type CreateDraftInput = z.output<typeof createDraftSchema>;
export type UpdateDraftInput = z.output<typeof updateDraftSchema>;

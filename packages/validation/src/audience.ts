import { z } from 'zod';

export const contentVisibilitySchema = z.enum(['public', 'followers', 'circles']);
export const audienceSelectorSchema = z.enum(['public', 'followers', 'circles']);

export const circleIdsSchema = z.array(z.string().min(1)).max(20);

export const audienceFields = {
  visibility: contentVisibilitySchema.default('public'),
  audience: audienceSelectorSchema.optional(),
  circleIds: circleIdsSchema.optional(),
};

export function refineAudience(
  value: { visibility?: string; audience?: string; circleIds?: string[] },
  ctx: z.RefinementCtx,
): void {
  const vis = value.audience ?? value.visibility ?? 'public';
  const ids = [...new Set(value.circleIds ?? [])];
  if (vis === 'circles' && ids.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pick at least one Circle.',
      path: ['circleIds'],
    });
  }
}

export type ContentVisibility = z.infer<typeof contentVisibilitySchema>;

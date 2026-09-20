import { z } from 'zod';
import { handleSchema } from './handle';

export const profileLinkSchema = z.object({
  title: z.string().trim().min(1).max(40),
  url: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((value) => /^https?:\/\//i.test(value), 'Links must be http or https'),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    bio: z.string().max(500).optional(),
    pronouns: z.string().trim().max(40).nullable().optional(),
    category: z.string().trim().max(80).nullable().optional(),
    links: z.array(profileLinkSchema).max(3).optional(),
    accountType: z.enum(['personal', 'creator', 'business']).optional(),
    memoryMapEnabled: z.boolean().optional(),
    defaultAppreciation: z.enum(['inspiring', 'funny', 'love', 'useful']).optional(),
    momentArchiveEnabled: z.boolean().optional(),
    activityStatusEnabled: z.boolean().optional(),
    readReceiptsEnabled: z.boolean().optional(),
    whoCanMessage: z.enum(['everyone', 'followers', 'nobody']).optional(),
    sensitivityLevel: z.enum(['hide', 'warn', 'show']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const updateHandleSchema = z.object({
  handle: handleSchema,
});

export const updatePrivacySchema = z
  .object({
    isPrivate: z.boolean().optional(),
    momentArchiveEnabled: z.boolean().optional(),
  })
  .refine((value) => value.isPrivate !== undefined || value.momentArchiveEnabled !== undefined, {
    message: 'No changes',
  });

export const muteBodySchema = z.object({
  scope: z.enum(['posts', 'moments', 'both']).default('both'),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const URL_IN_TEXT = /https?:\/\/[^\s<]+/gi;

export function extractBioUrls(bio: string): string[] {
  const matches = bio.match(URL_IN_TEXT) ?? [];
  const unique: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;]+$/g, '');
    if (!unique.includes(cleaned)) unique.push(cleaned);
  }
  return unique;
}

export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
export type ProfileLink = z.output<typeof profileLinkSchema>;

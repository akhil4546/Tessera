import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
});

export const readinessCheckSchema = z.object({
  status: z.enum(['ok', 'down', 'DEGRADED', 'NOT_CONFIGURED']),
  latencyMs: z.number().int().nonnegative(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string().min(1),
  checks: z.object({
    postgres: readinessCheckSchema,
    redis: readinessCheckSchema,
    storage: readinessCheckSchema,
    search: readinessCheckSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

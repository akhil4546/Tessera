import { z } from 'zod';

export const MAX_CIRCLE_NAME = 40;
export const MAX_CIRCLES_PER_USER = 30;
export const MAX_CIRCLE_MEMBERS = 150;

export const createCircleSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CIRCLE_NAME),
});

export const updateCircleSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CIRCLE_NAME),
});

export const circleMemberSchema = z.object({
  handle: z.string().trim().min(2).max(30),
});

export type CreateCircleInput = z.output<typeof createCircleSchema>;
export type UpdateCircleInput = z.output<typeof updateCircleSchema>;

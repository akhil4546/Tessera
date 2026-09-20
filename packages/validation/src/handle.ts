import { z } from 'zod';

export const HANDLE_CHANGE_COOLDOWN_DAYS = 14;

/**
 * Reserved handles. Kept here (not in the API app) so web and mobile can
 * validate before submit in Phase 1.
 */
export const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'create',
  'discover',
  'help',
  'inbox',
  'instagram',
  'login',
  'me',
  'meta',
  'moderation',
  'official',
  'root',
  'security',
  'settings',
  'signup',
  'support',
  'system',
  'tessera',
  'undefined',
  'null',
]);

export const handleSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, and underscores only')
  .transform((value) => value.toLowerCase())
  .refine((value) => !/^[0-9]+$/.test(value), 'Handle cannot be only numbers')
  .refine((value) => !RESERVED_HANDLES.has(value), 'This handle is reserved');

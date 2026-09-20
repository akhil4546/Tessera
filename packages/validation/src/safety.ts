import { z } from 'zod';

export const reportTargetKindSchema = z.enum([
  'post',
  'comment',
  'moment',
  'loop',
  'message',
  'conversation',
  'account',
]);

export const reportReasonSchema = z.enum([
  'spam',
  'harassment',
  'hate',
  'nudity',
  'violence',
  'self_harm',
  'impersonation',
  'underage',
  'other',
]);

export const sensitivityLevelSchema = z.enum(['hide', 'warn', 'show']);

export const createReportSchema = z.object({
  targetKind: reportTargetKindSchema,
  targetId: z.string().min(1).max(64),
  reason: reportReasonSchema,
  details: z.string().trim().max(2000).default(''),
});

export const reportBodySchema = z.object({
  reason: reportReasonSchema,
  details: z.string().trim().max(2000).default(''),
});

export const createAppealSchema = z.object({
  caseId: z.string().min(1).max(64),
  statement: z.string().trim().min(8).max(4000),
});

export const updateSensitivitySchema = z.object({
  sensitivityLevel: sensitivityLevelSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
});

export const wellbeingHeartbeatSchema = z.object({
  seconds: z.number().int().min(1).max(60),
});

export const MIN_DAILY_REMINDER_MINUTES = 15;
export const MAX_DAILY_REMINDER_MINUTES = 720;
export const MIN_SESSION_NUDGE_MINUTES = 15;
export const MAX_SESSION_NUDGE_MINUTES = 240;

export const adminLoginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const adminActionSchema = z.object({
  kind: z.enum([
    'dismiss',
    'takedown',
    'restore',
    'suspend',
    'unsuspend',
    'mark_sensitive',
    'unmark_sensitive',
    'hide_comment',
    'warn',
  ]),
  note: z.string().trim().max(2000).default(''),
  suspendDays: z.number().int().min(1).max(365).optional(),
});

export const adminSuspendSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  days: z.number().int().min(1).max(365).nullable().default(null),
});

export const adminAppealResolveSchema = z.object({
  status: z.enum(['upheld', 'rejected']),
  decision: z.string().trim().min(3).max(2000),
});

export const keywordFilterSchema = z.object({
  keyword: z.string().trim().min(2).max(80).transform((value) => value.toLowerCase()),
  action: z.enum(['flag', 'hide', 'queue']).default('queue'),
});

export const adminQueueQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['open', 'in_review', 'actioned', 'dismissed']).optional(),
  source: z.enum(['report', 'classifier', 'keyword', 'spam']).optional(),
});

export const adminUserQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminAuditQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateReportInput = z.output<typeof createReportSchema>;
export type ReportBodyInput = z.output<typeof reportBodySchema>;
export type CreateAppealInput = z.output<typeof createAppealSchema>;
export type AdminLoginInput = z.output<typeof adminLoginSchema>;
export type AdminActionInput = z.output<typeof adminActionSchema>;

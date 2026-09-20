export const REPORT_TARGET_KINDS = [
  'post',
  'comment',
  'moment',
  'loop',
  'message',
  'conversation',
  'account',
] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'nudity',
  'violence',
  'self_harm',
  'impersonation',
  'underage',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const SENSITIVITY_LEVELS = ['hide', 'warn', 'show'] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

export const ADMIN_ROLES = ['moderator', 'admin', 'superadmin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const MODERATION_CASE_STATUSES = ['open', 'in_review', 'actioned', 'dismissed'] as const;
export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUSES)[number];

export const MODERATION_CASE_SOURCES = ['report', 'classifier', 'keyword', 'spam'] as const;
export type ModerationCaseSource = (typeof MODERATION_CASE_SOURCES)[number];

export const MODERATION_ACTION_KINDS = [
  'dismiss',
  'takedown',
  'restore',
  'suspend',
  'unsuspend',
  'mark_sensitive',
  'unmark_sensitive',
  'hide_comment',
  'warn',
] as const;
export type ModerationActionKind = (typeof MODERATION_ACTION_KINDS)[number];

export const APPEAL_STATUSES = ['pending', 'upheld', 'rejected'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const KEYWORD_FILTER_ACTIONS = ['flag', 'hide', 'queue'] as const;
export type KeywordFilterAction = (typeof KEYWORD_FILTER_ACTIONS)[number];

export const CLASSIFICATION_LABELS = ['unknown', 'none', 'likely'] as const;
export type ClassificationLabel = (typeof CLASSIFICATION_LABELS)[number];

export const EXPORT_JOB_STATUSES = ['pending', 'running', 'ready', 'failed'] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export const DELETION_REQUEST_STATUSES = ['pending', 'cancelled', 'completed'] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export const DELETION_GRACE_DAYS = 30;
export const MIN_SESSION_NUDGE_MINUTES = 15;
export const MAX_SESSION_NUDGE_MINUTES = 240;
export const MIN_DAILY_REMINDER_MINUTES = 15;
export const MAX_DAILY_REMINDER_MINUTES = 720;

export type ReportView = {
  id: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'linked' | 'withdrawn';
  caseId: string | null;
  createdAt: string;
};

export type AppealView = {
  id: string;
  caseId: string;
  statement: string;
  status: AppealStatus;
  decision: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type ExportJobView = {
  id: string;
  status: ExportJobStatus;
  error: string | null;
  downloadUrl: string | null;
  byteSize: number | null;
  emailSent: boolean;
  createdAt: string;
  expiresAt: string | null;
};

export type DeletionRequestView = {
  id: string;
  status: DeletionRequestStatus;
  requestedAt: string;
  executeAt: string;
  cancelledAt: string | null;
};

export type SafetyLists = {
  blocked: { handle: string; displayName: string }[];
  muted: { handle: string; displayName: string; scope: 'posts' | 'moments' | 'both' }[];
  restricted: { handle: string; displayName: string }[];
};

export type AdminMe = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
};

export type AdminAuthSuccess = {
  admin: AdminMe;
};

export type ModerationCaseCard = {
  id: string;
  status: ModerationCaseStatus;
  source: ModerationCaseSource;
  targetKind: ReportTargetKind;
  targetId: string;
  subjectHandle: string | null;
  summary: string;
  reportCount: number;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModerationCaseDetail = ModerationCaseCard & {
  reports: ReportView[];
  actions: {
    id: string;
    kind: ModerationActionKind;
    note: string;
    adminEmail: string | null;
    createdAt: string;
  }[];
  appeals: AppealView[];
  preview: Record<string, unknown> | null;
};

export type AdminUserLookup = {
  id: string;
  handle: string;
  email: string;
  displayName: string;
  isMinor: boolean;
  isPrivate: boolean;
  deactivatedAt: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
  counts: { followers: number; following: number; posts: number; reports: number };
};

export type AuditLogView = {
  id: string;
  adminEmail: string;
  action: string;
  targetKind: string;
  targetId: string;
  subjectHandle: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type KeywordFilterView = {
  id: string;
  keyword: string;
  action: KeywordFilterAction;
  createdAt: string;
};

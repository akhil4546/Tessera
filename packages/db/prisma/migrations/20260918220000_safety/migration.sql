-- CreateEnum
CREATE TYPE "SensitivityLevel" AS ENUM ('hide', 'warn', 'show');

-- CreateEnum
CREATE TYPE "ReportTargetKind" AS ENUM ('post', 'comment', 'moment', 'loop', 'message', 'conversation', 'account');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'impersonation', 'underage', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'linked', 'withdrawn');

-- CreateEnum
CREATE TYPE "ModerationCaseStatus" AS ENUM ('open', 'in_review', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "ModerationCaseSource" AS ENUM ('report', 'classifier', 'keyword', 'spam');

-- CreateEnum
CREATE TYPE "ModerationActionKind" AS ENUM ('dismiss', 'takedown', 'restore', 'suspend', 'unsuspend', 'mark_sensitive', 'unmark_sensitive', 'hide_comment', 'warn');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'upheld', 'rejected');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('moderator', 'admin', 'superadmin');

-- CreateEnum
CREATE TYPE "KeywordFilterAction" AS ENUM ('flag', 'hide', 'queue');

-- CreateEnum
CREATE TYPE "ClassificationLabel" AS ENUM ('unknown', 'none', 'likely');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('pending', 'running', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('pending', 'cancelled', 'completed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendReason" TEXT,
ADD COLUMN "suspensionEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "sensitivityLevel" "SensitivityLevel" NOT NULL DEFAULT 'warn';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "takenDownAt" TIMESTAMP(3),
ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "media_items" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "moderationHold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN "hiddenByRestrict" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "restrictApprovedAt" TIMESTAMP(3),
ADD COLUMN "takenDownAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "moments" ADD COLUMN "takenDownAt" TIMESTAMP(3),
ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "wellbeing_settings" ADD COLUMN "dailyReminderMinutes" INTEGER,
ADD COLUMN "sessionNudgeMinutes" INTEGER,
ADD COLUMN "lastBreakNudgeAt" TIMESTAMP(3),
ADD COLUMN "sessionStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "restricts" (
    "id" TEXT NOT NULL,
    "restrictorId" TEXT NOT NULL,
    "restrictedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetKind" "ReportTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reportedUserId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" TEXT NOT NULL,
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'open',
    "source" "ModerationCaseSource" NOT NULL,
    "targetKind" "ReportTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "assignedToAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "ModerationActionKind" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "decision" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'moderator',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_filters" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "action" "KeywordFilterAction" NOT NULL DEFAULT 'queue',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_classifications" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "labelledStub" BOOLEAN NOT NULL DEFAULT false,
    "nudity" "ClassificationLabel" NOT NULL DEFAULT 'unknown',
    "violence" "ClassificationLabel" NOT NULL DEFAULT 'unknown',
    "note" TEXT NOT NULL DEFAULT '',
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "archiveKey" TEXT,
    "byteSize" INTEGER,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_time_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restricts_restrictorId_restrictedId_key" ON "restricts"("restrictorId", "restrictedId");
CREATE INDEX "restricts_restrictedId_idx" ON "restricts"("restrictedId");

-- CreateIndex
CREATE INDEX "reports_reporterId_createdAt_idx" ON "reports"("reporterId", "createdAt" DESC);
CREATE INDEX "reports_targetKind_targetId_idx" ON "reports"("targetKind", "targetId");
CREATE INDEX "reports_caseId_idx" ON "reports"("caseId");
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_cases_status_createdAt_idx" ON "moderation_cases"("status", "createdAt" DESC);
CREATE INDEX "moderation_cases_targetKind_targetId_idx" ON "moderation_cases"("targetKind", "targetId");
CREATE INDEX "moderation_cases_subjectUserId_idx" ON "moderation_cases"("subjectUserId");
CREATE INDEX "moderation_cases_assignedToAdminId_idx" ON "moderation_cases"("assignedToAdminId");

-- CreateIndex
CREATE INDEX "moderation_actions_caseId_createdAt_idx" ON "moderation_actions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "appeals_userId_createdAt_idx" ON "appeals"("userId", "createdAt" DESC);
CREATE INDEX "appeals_status_createdAt_idx" ON "appeals"("status", "createdAt");
CREATE INDEX "appeals_caseId_idx" ON "appeals"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_refreshTokenHash_key" ON "admin_sessions"("refreshTokenHash");
CREATE INDEX "admin_sessions_adminId_revokedAt_idx" ON "admin_sessions"("adminId", "revokedAt");
CREATE INDEX "admin_sessions_familyId_idx" ON "admin_sessions"("familyId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_id_idx" ON "audit_logs"("createdAt" DESC, "id" DESC);
CREATE INDEX "audit_logs_adminId_createdAt_idx" ON "audit_logs"("adminId", "createdAt" DESC);
CREATE INDEX "audit_logs_targetKind_targetId_idx" ON "audit_logs"("targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_filters_keyword_key" ON "keyword_filters"("keyword");

-- CreateIndex
CREATE INDEX "media_classifications_mediaId_createdAt_idx" ON "media_classifications"("mediaId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "export_jobs_userId_createdAt_idx" ON "export_jobs"("userId", "createdAt" DESC);
CREATE INDEX "export_jobs_status_createdAt_idx" ON "export_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "deletion_requests_status_executeAt_idx" ON "deletion_requests"("status", "executeAt");
CREATE INDEX "deletion_requests_userId_status_idx" ON "deletion_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "app_time_logs_userId_day_idx" ON "app_time_logs"("userId", "day");

-- CreateIndex
CREATE INDEX "users_suspendedAt_idx" ON "users"("suspendedAt");

-- AddForeignKey
ALTER TABLE "restricts" ADD CONSTRAINT "restricts_restrictorId_fkey" FOREIGN KEY ("restrictorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restricts" ADD CONSTRAINT "restricts_restrictedId_fkey" FOREIGN KEY ("restrictedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_assignedToAdminId_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "appeals" ADD CONSTRAINT "appeals_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "media_classifications" ADD CONSTRAINT "media_classifications_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_classifications" ADD CONSTRAINT "media_classifications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_time_logs" ADD CONSTRAINT "app_time_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

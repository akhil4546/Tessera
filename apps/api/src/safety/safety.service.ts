import { Injectable } from '@nestjs/common';
import {
  DELETION_GRACE_DAYS,
  duplicateBurst,
  keywordActionPriority,
  matchKeywordFilters,
  sessionWellbeingState,
  urlHeavyNewAccount,
  utcDay,
} from '@tessera/media';
import type {
  AppealView,
  DeletionRequestView,
  ExportJobView,
  ReportTargetKind,
  ReportView,
  SensitivityLevel,
} from '@tessera/types';
import type { CreateAppealInput, CreateReportInput } from '@tessera/validation';
import { SessionCache } from '../auth/session-cache.js';
import { verifyPassword } from '../common/crypto.js';
import { TesseraHttpError } from '../common/http-error.js';
import { RateLimitService } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly queues: QueueService,
    private readonly storage: StorageService,
    private readonly sessions: SessionCache,
  ) {}

  async report(
    reporterId: string,
    input: CreateReportInput,
  ): Promise<ReportView> {
    await this.rateLimit.consume(`report:${reporterId}`, 20, 60 * 60);
    const resolved = await this.resolveTarget(reporterId, input.targetKind, input.targetId);
    if (resolved.subjectUserId === reporterId) {
      throw new TesseraHttpError(400, 'SELF', 'You cannot report yourself.');
    }
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetKind: input.targetKind,
        targetId: resolved.targetId,
        status: { in: ['open', 'linked'] },
      },
    });
    if (existing) return this.toReportView(existing);

    const openCase = await this.prisma.moderationCase.findFirst({
      where: {
        targetKind: input.targetKind,
        targetId: resolved.targetId,
        status: { in: ['open', 'in_review'] },
      },
    });
    const moderationCase =
      openCase ??
      (await this.prisma.moderationCase.create({
        data: {
          source: 'report',
          targetKind: input.targetKind,
          targetId: resolved.targetId,
          subjectUserId: resolved.subjectUserId,
          summary: `Report: ${input.reason} on ${input.targetKind} ${resolved.targetId}`,
        },
      }));

    const created = await this.prisma.report.create({
      data: {
        reporterId,
        targetKind: input.targetKind,
        targetId: resolved.targetId,
        reportedUserId: resolved.subjectUserId,
        reason: input.reason,
        details: input.details,
        status: 'linked',
        caseId: moderationCase.id,
      },
    });
    return this.toReportView(created);
  }

  async reportHandle(reporterId: string, handle: string, input: Omit<CreateReportInput, 'targetKind' | 'targetId'>) {
    const target = await this.users.loadByHandle(handle);
    return this.report(reporterId, { ...input, targetKind: 'account', targetId: target.id });
  }

  async applyTextFilters(input: {
    text: string;
    authorId: string;
    targetKind: ReportTargetKind;
    targetId: string;
    subjectUserId: string;
  }): Promise<{ hide: boolean; queued: boolean }> {
    const filters = await this.prisma.keywordFilter.findMany();
    const hits = matchKeywordFilters(input.text, filters);
    const action = keywordActionPriority(hits);
    if (!action) return { hide: false, queued: false };
    if (action === 'queue' || action === 'flag') {
      await this.openKeywordCase(input, hits.map((hit) => hit.keyword).join(', '));
    }
    return { hide: action === 'hide', queued: action === 'queue' || action === 'flag' };
  }

  async assertCommentNotSpam(userId: string, body: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!user) return;
    if (urlHeavyNewAccount({ accountAgeMs: Date.now() - user.createdAt.getTime(), body })) {
      await this.openSpamCase(userId, 'comment', body);
      throw new TesseraHttpError(429, 'SPAM', 'That comment looks like spam from a new account.');
    }
    const recent = await this.prisma.comment.findMany({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
      select: { body: true },
      take: 10,
    });
    if (duplicateBurst({ body, recentBodies: recent.map((row) => row.body) })) {
      await this.openSpamCase(userId, 'comment', body);
      throw new TesseraHttpError(429, 'SPAM', 'That comment was repeated too quickly.');
    }
  }

  async assertMessageNotSpam(userId: string, body: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!user) return;
    if (urlHeavyNewAccount({ accountAgeMs: Date.now() - user.createdAt.getTime(), body })) {
      await this.openSpamCase(userId, 'message', body);
      throw new TesseraHttpError(429, 'SPAM', 'That message looks like spam from a new account.');
    }
    const recent = await this.prisma.message.findMany({
      where: { senderId: userId, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
      select: { body: true },
      take: 12,
    });
    if (duplicateBurst({ body, recentBodies: recent.map((row) => row.body) })) {
      await this.openSpamCase(userId, 'message', body);
      throw new TesseraHttpError(429, 'SPAM', 'That message was repeated too quickly.');
    }
  }

  async isRestricted(restrictorId: string, restrictedId: string): Promise<boolean> {
    const row = await this.prisma.restrict.findUnique({
      where: { restrictorId_restrictedId: { restrictorId, restrictedId } },
    });
    return Boolean(row);
  }

  async createAppeal(userId: string, input: CreateAppealInput): Promise<AppealView> {
    const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: input.caseId } });
    if (!moderationCase || moderationCase.subjectUserId !== userId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No moderation case to appeal.');
    }
    if (moderationCase.status !== 'actioned') {
      throw new TesseraHttpError(409, 'NOT_ACTIONED', 'You can appeal after a moderator takes action.');
    }
    const existing = await this.prisma.appeal.findFirst({
      where: { caseId: input.caseId, userId, status: 'pending' },
    });
    if (existing) return this.toAppealView(existing);
    const created = await this.prisma.appeal.create({
      data: { caseId: input.caseId, userId, statement: input.statement },
    });
    return this.toAppealView(created);
  }

  async myAppeals(userId: string): Promise<{ items: AppealView[] }> {
    const rows = await this.prisma.appeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: rows.map((row) => this.toAppealView(row)) };
  }

  async myReports(userId: string): Promise<{ items: ReportView[] }> {
    const rows = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: rows.map((row) => this.toReportView(row)) };
  }

  async setSensitivity(userId: string, sensitivityLevel: SensitivityLevel) {
    await this.prisma.profile.update({ where: { userId }, data: { sensitivityLevel } });
    return this.users.getMe(userId);
  }

  async requestExport(userId: string): Promise<ExportJobView> {
    await this.rateLimit.consume(`export:${userId}`, 3, 24 * 60 * 60);
    const running = await this.prisma.exportJob.findFirst({
      where: { userId, status: { in: ['pending', 'running'] } },
    });
    if (running) return this.toExportView(running);
    const job = await this.prisma.exportJob.create({ data: { userId } });
    await this.queues.exportAccount(job.id);
    return this.toExportView(job);
  }

  async getExport(userId: string, jobId: string): Promise<ExportJobView> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new TesseraHttpError(404, 'NOT_FOUND', 'Export not found.');
    return this.toExportView(job);
  }

  async listExports(userId: string): Promise<{ items: ExportJobView[] }> {
    const rows = await this.prisma.exportJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const items: ExportJobView[] = [];
    for (const row of rows) items.push(await this.toExportView(row));
    return { items };
  }

  async requestDeletion(userId: string, password: string): Promise<DeletionRequestView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Password is wrong.');
    const existing = await this.prisma.deletionRequest.findFirst({
      where: { userId, status: 'pending' },
    });
    if (existing) return this.toDeletionView(existing);
    const executeAt = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.deletionRequest.create({
      data: { userId, executeAt },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    await this.sessions.revokeWhere({ userId }, 'user', userId);
    return this.toDeletionView(created);
  }

  async cancelDeletion(userId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.deletionRequest.findFirst({
      where: { userId, status: 'pending' },
    });
    if (!existing) throw new TesseraHttpError(404, 'NOT_FOUND', 'No pending deletion.');
    await this.prisma.deletionRequest.update({
      where: { id: existing.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { deactivatedAt: null } });
    return { ok: true };
  }

  async pendingDeletion(userId: string): Promise<DeletionRequestView | null> {
    const row = await this.prisma.deletionRequest.findFirst({
      where: { userId, status: 'pending' },
    });
    return row ? this.toDeletionView(row) : null;
  }

  async heartbeat(userId: string, seconds: number) {
    const setting = await this.prisma.wellbeingSetting.upsert({
      where: { userId },
      create: { userId, sessionStartedAt: new Date() },
      update: {},
    });
    const now = new Date();
    const sessionStart =
      setting.sessionStartedAt && now.getTime() - setting.sessionStartedAt.getTime() < 2 * 60 * 60 * 1000
        ? setting.sessionStartedAt
        : now;
    if (!setting.sessionStartedAt || sessionStart.getTime() === now.getTime()) {
      await this.prisma.wellbeingSetting.update({
        where: { userId },
        data: { sessionStartedAt: now },
      });
    }
    const day = utcDay(now);
    await this.prisma.appTimeLog.create({ data: { userId, seconds, day } });
    const watched = await this.prisma.appTimeLog.aggregate({
      where: { userId, day },
      _sum: { seconds: true },
    });
    const state = sessionWellbeingState({
      dailyReminderMinutes: setting.dailyReminderMinutes,
      sessionNudgeMinutes: setting.sessionNudgeMinutes,
      lastBreakNudgeAt: setting.lastBreakNudgeAt,
      sessionStartedAt: sessionStart,
      appSecondsToday: watched._sum.seconds ?? 0,
      now,
    });
    if (state.sessionNudgeReached) {
      await this.prisma.wellbeingSetting.update({
        where: { userId },
        data: { lastBreakNudgeAt: now },
      });
    }
    return state;
  }

  async dismissSessionNudge(userId: string) {
    await this.prisma.wellbeingSetting.upsert({
      where: { userId },
      create: { userId, lastBreakNudgeAt: new Date() },
      update: { lastBreakNudgeAt: new Date() },
    });
    return { ok: true as const };
  }

  private async openKeywordCase(
    input: { authorId: string; targetKind: ReportTargetKind; targetId: string; subjectUserId: string },
    keywords: string,
  ) {
    const existing = await this.prisma.moderationCase.findFirst({
      where: { targetKind: input.targetKind, targetId: input.targetId, status: { in: ['open', 'in_review'] } },
    });
    if (existing) return existing;
    return this.prisma.moderationCase.create({
      data: {
        source: 'keyword',
        targetKind: input.targetKind,
        targetId: input.targetId,
        subjectUserId: input.subjectUserId,
        summary: `Keyword filter matched (${keywords}).`,
      },
    });
  }

  private async openSpamCase(userId: string, kind: 'comment' | 'message', preview: string) {
    await this.prisma.moderationCase.create({
      data: {
        source: 'spam',
        targetKind: kind === 'comment' ? 'comment' : 'message',
        targetId: userId,
        subjectUserId: userId,
        summary: `Spam heuristic: ${preview.slice(0, 120)}`,
      },
    });
  }

  private async resolveTarget(
    reporterId: string,
    kind: ReportTargetKind,
    targetId: string,
  ): Promise<{ targetId: string; subjectUserId: string }> {
    if (kind === 'account') {
      const user = await this.prisma.user.findFirst({
        where: { OR: [{ id: targetId }, { handle: targetId.toLowerCase() }] },
      });
      if (!user) throw new TesseraHttpError(404, 'NOT_FOUND', 'Account not found.');
      return { targetId: user.id, subjectUserId: user.id };
    }
    if (kind === 'post' || kind === 'loop') {
      const post = await this.prisma.post.findUnique({ where: { id: targetId } });
      if (!post || post.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
      if (kind === 'loop' && post.kind !== 'loop') throw new TesseraHttpError(404, 'NOT_FOUND', 'Loop not found.');
      return { targetId: post.id, subjectUserId: post.authorId };
    }
    if (kind === 'comment') {
      const comment = await this.prisma.comment.findUnique({ where: { id: targetId } });
      if (!comment || comment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Comment not found.');
      return { targetId: comment.id, subjectUserId: comment.authorId };
    }
    if (kind === 'moment') {
      const moment = await this.prisma.moment.findUnique({ where: { id: targetId } });
      if (!moment || moment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
      return { targetId: moment.id, subjectUserId: moment.authorId };
    }
    if (kind === 'conversation') {
      const member = await this.prisma.conversationMember.findFirst({
        where: { conversationId: targetId, userId: reporterId, leftAt: null },
      });
      if (!member) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
      const other = await this.prisma.conversationMember.findFirst({
        where: { conversationId: targetId, userId: { not: reporterId }, leftAt: null },
      });
      return { targetId, subjectUserId: other?.userId ?? reporterId };
    }
    if (kind === 'message') {
      const message = await this.prisma.message.findUnique({ where: { id: targetId } });
      if (!message || message.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
      const member = await this.prisma.conversationMember.findFirst({
        where: { conversationId: message.conversationId, userId: reporterId, leftAt: null },
      });
      if (!member) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
      return { targetId: message.id, subjectUserId: message.senderId };
    }
    throw new TesseraHttpError(400, 'VALIDATION', 'Unknown report target.');
  }

  private toReportView(row: {
    id: string;
    targetKind: ReportTargetKind;
    targetId: string;
    reason: ReportView['reason'];
    details: string;
    status: ReportView['status'];
    caseId: string | null;
    createdAt: Date;
  }): ReportView {
    return {
      id: row.id,
      targetKind: row.targetKind,
      targetId: row.targetId,
      reason: row.reason,
      details: row.details,
      status: row.status,
      caseId: row.caseId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAppealView(row: {
    id: string;
    caseId: string;
    statement: string;
    status: AppealView['status'];
    decision: string;
    createdAt: Date;
    resolvedAt: Date | null;
  }): AppealView {
    return {
      id: row.id,
      caseId: row.caseId,
      statement: row.statement,
      status: row.status,
      decision: row.decision,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  private async toExportView(row: {
    id: string;
    status: ExportJobView['status'];
    error: string | null;
    archiveKey: string | null;
    byteSize: number | null;
    emailSent: boolean;
    createdAt: Date;
    expiresAt: Date | null;
  }): Promise<ExportJobView> {
    const downloadUrl =
      row.status === 'ready' && row.archiveKey ? await this.storage.signGet(row.archiveKey) : null;
    return {
      id: row.id,
      status: row.status,
      error: row.error,
      downloadUrl,
      byteSize: row.byteSize,
      emailSent: row.emailSent,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  private toDeletionView(row: {
    id: string;
    status: DeletionRequestView['status'];
    requestedAt: Date;
    executeAt: Date;
    cancelledAt: Date | null;
  }): DeletionRequestView {
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      executeAt: row.executeAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
}


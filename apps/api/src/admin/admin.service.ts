import { Injectable } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import { meiliDeleteDocument, SEARCH_INDEXES } from '@tessera/media';
import type {
  AdminUserLookup,
  AppealView,
  AuditLogView,
  KeywordFilterView,
  ModerationActionKind,
  ModerationCaseCard,
  ModerationCaseDetail,
  Paginated,
  ReportTargetKind,
} from '@tessera/types';
import { TesseraHttpError } from '../common/http-error.js';
import { encodeCursor } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { SearchService } from '../discovery/search.service.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly search: SearchService,
  ) {}

  async queue(opts: {
    cursor?: string;
    limit: number;
    status?: 'open' | 'in_review' | 'actioned' | 'dismissed';
    source?: 'report' | 'classifier' | 'keyword' | 'spam';
  }): Promise<Paginated<ModerationCaseCard>> {
    const rows = await this.prisma.moderationCase.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.source ? { source: opts.source } : {}),
        ...(opts.cursor ? cursorWhere(opts.cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      include: {
        subject: { select: { handle: true } },
        assignedTo: { select: { email: true } },
        _count: { select: { reports: true } },
      },
    });
    const slice = rows.slice(0, opts.limit);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((row) => this.toCard(row)),
      nextCursor: rows.length > opts.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async getCase(id: string): Promise<ModerationCaseDetail> {
    const row = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: {
        subject: { select: { handle: true } },
        assignedTo: { select: { email: true } },
        reports: { orderBy: { createdAt: 'desc' } },
        actions: { orderBy: { createdAt: 'asc' }, include: { admin: { select: { email: true } } } },
        appeals: { orderBy: { createdAt: 'desc' } },
        _count: { select: { reports: true } },
      },
    });
    if (!row) throw new TesseraHttpError(404, 'NOT_FOUND', 'Case not found.');
    return {
      ...this.toCard(row),
      reports: row.reports.map((report) => ({
        id: report.id,
        targetKind: report.targetKind,
        targetId: report.targetId,
        reason: report.reason,
        details: report.details,
        status: report.status,
        caseId: report.caseId,
        createdAt: report.createdAt.toISOString(),
      })),
      actions: row.actions.map((action) => ({
        id: action.id,
        kind: action.kind,
        note: action.note,
        adminEmail: action.admin?.email ?? null,
        createdAt: action.createdAt.toISOString(),
      })),
      appeals: row.appeals.map((appeal) => this.toAppeal(appeal)),
      preview: await this.preview(row.targetKind, row.targetId),
    };
  }

  async claim(adminId: string, caseId: string): Promise<ModerationCaseDetail> {
    const updated = await this.prisma.moderationCase.updateMany({
      where: { id: caseId, status: { in: ['open', 'in_review'] } },
      data: { status: 'in_review', assignedToAdminId: adminId },
    });
    if (updated.count === 0) throw new TesseraHttpError(404, 'NOT_FOUND', 'Case not found or already closed.');
    await this.audit(adminId, 'case.claim', 'case', caseId, {});
    return this.getCase(caseId);
  }

  async act(
    adminId: string,
    caseId: string,
    kind: ModerationActionKind,
    note: string,
    suspendDays?: number | null,
  ): Promise<ModerationCaseDetail> {
    const moderationCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
    if (!moderationCase) throw new TesseraHttpError(404, 'NOT_FOUND', 'Case not found.');
    if (kind !== 'dismiss' && kind !== 'warn') {
      await this.applyAction(adminId, moderationCase.targetKind, moderationCase.targetId, kind, note, suspendDays);
    }
    await this.prisma.moderationAction.create({
      data: { caseId, kind, note, adminId },
    });
    const closed = kind === 'dismiss' ? 'dismissed' : 'actioned';
    await this.prisma.moderationCase.update({
      where: { id: caseId },
      data: { status: closed, resolvedAt: new Date(), assignedToAdminId: adminId },
    });
    await this.audit(adminId, `case.${kind}`, moderationCase.targetKind, moderationCase.targetId, {
      caseId,
      note,
      subjectUserId: moderationCase.subjectUserId,
    });
    return this.getCase(caseId);
  }

  async lookupUsers(q: string, cursor: string | undefined, limit: number): Promise<Paginated<AdminUserLookup>> {
    const term = q.replace(/[%_]/g, '').trim();
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [
          { handle: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { profile: { displayName: { contains: term, mode: 'insensitive' } } },
        ],
        ...(cursor ? cursorWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { profile: true },
    });
    const slice = rows.slice(0, limit);
    const items: AdminUserLookup[] = [];
    for (const row of slice) {
      items.push(await this.toLookup(row));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async getUser(id: string): Promise<AdminUserLookup> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { profile: true } });
    if (!user) throw new TesseraHttpError(404, 'NOT_FOUND', 'User not found.');
    return this.toLookup(user);
  }

  async suspend(adminId: string, userId: string, reason: string, days: number | null): Promise<AdminUserLookup> {
    const ends = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedAt: new Date(), suspendReason: reason, suspensionEndsAt: ends },
    });
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await meiliDeleteDocument(SEARCH_INDEXES.people, userId);
    await this.audit(adminId, 'user.suspend', 'account', userId, { reason, days });
    return this.getUser(userId);
  }

  async unsuspend(adminId: string, userId: string): Promise<AdminUserLookup> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedAt: null, suspendReason: null, suspensionEndsAt: null },
    });
    await this.search.indexUser(userId);
    await this.audit(adminId, 'user.unsuspend', 'account', userId, {});
    return this.getUser(userId);
  }

  async takedownPost(adminId: string, postId: string, note: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    await this.prisma.post.update({ where: { id: postId }, data: { takenDownAt: new Date() } });
    await this.queues.retract(postId);
    await meiliDeleteDocument(SEARCH_INDEXES.captions, postId);
    await this.audit(adminId, 'post.takedown', post.kind === 'loop' ? 'loop' : 'post', postId, { note });
    return { ok: true as const };
  }

  async restorePost(adminId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    await this.prisma.post.update({ where: { id: postId }, data: { takenDownAt: null } });
    if (post.publishedAt) await this.queues.fanout(postId);
    await this.search.indexPost(postId);
    await this.audit(adminId, 'post.restore', post.kind === 'loop' ? 'loop' : 'post', postId, {});
    return { ok: true as const };
  }

  async takedownMoment(adminId: string, momentId: string, note: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    await this.prisma.moment.update({ where: { id: momentId }, data: { takenDownAt: new Date() } });
    await this.audit(adminId, 'moment.takedown', 'moment', momentId, { note });
    return { ok: true as const };
  }

  async listAppeals(cursor: string | undefined, limit: number): Promise<Paginated<AppealView & { handle: string | null }>> {
    const rows = await this.prisma.appeal.findMany({
      where: { ...(cursor ? cursorWhere(cursor) : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { user: { select: { handle: true } } },
    });
    const slice = rows.slice(0, limit);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((row) => ({ ...this.toAppeal(row), handle: row.user.handle })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async resolveAppeal(adminId: string, appealId: string, status: 'upheld' | 'rejected', decision: string) {
    const appeal = await this.prisma.appeal.findUnique({ where: { id: appealId }, include: { case: true } });
    if (!appeal || appeal.status !== 'pending') {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Appeal not found.');
    }
    await this.prisma.appeal.update({
      where: { id: appealId },
      data: { status, decision, resolvedAt: new Date() },
    });
    if (status === 'upheld') {
      await this.applyAction(adminId, appeal.case.targetKind, appeal.case.targetId, 'restore', decision, null);
    }
    await this.audit(adminId, `appeal.${status}`, 'appeal', appealId, { decision, caseId: appeal.caseId });
    const fresh = await this.prisma.appeal.findUniqueOrThrow({ where: { id: appealId } });
    return this.toAppeal(fresh);
  }

  async listAudit(cursor: string | undefined, limit: number): Promise<Paginated<AuditLogView>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(cursor ? cursorWhere(cursor) : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { admin: { select: { email: true } }, subject: { select: { handle: true } } },
    });
    const slice = rows.slice(0, limit);
    const last = slice[slice.length - 1];
    return {
      items: slice.map((row) => ({
        id: row.id,
        adminEmail: row.admin.email,
        action: row.action,
        targetKind: row.targetKind,
        targetId: row.targetId,
        subjectHandle: row.subject?.handle ?? null,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async listKeywords(): Promise<{ items: KeywordFilterView[] }> {
    const rows = await this.prisma.keywordFilter.findMany({ orderBy: { keyword: 'asc' } });
    return {
      items: rows.map((row) => ({
        id: row.id,
        keyword: row.keyword,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async addKeyword(
    adminId: string,
    keyword: string,
    action: KeywordFilterView['action'],
  ): Promise<KeywordFilterView> {
    const row = await this.prisma.keywordFilter.upsert({
      where: { keyword },
      create: { keyword, action },
      update: { action },
    });
    await this.audit(adminId, 'keyword.upsert', 'keyword', row.id, { keyword, action });
    return { id: row.id, keyword: row.keyword, action: row.action, createdAt: row.createdAt.toISOString() };
  }

  async removeKeyword(adminId: string, id: string) {
    const row = await this.prisma.keywordFilter.findUnique({ where: { id } });
    if (!row) throw new TesseraHttpError(404, 'NOT_FOUND', 'Filter not found.');
    await this.prisma.keywordFilter.delete({ where: { id } });
    await this.audit(adminId, 'keyword.delete', 'keyword', id, { keyword: row.keyword });
    return { ok: true as const };
  }

  private async applyAction(
    adminId: string,
    targetKind: ReportTargetKind,
    targetId: string,
    kind: ModerationActionKind,
    note: string,
    suspendDays?: number | null,
  ) {
    if (kind === 'takedown' || kind === 'hide_comment') {
      if (targetKind === 'post' || targetKind === 'loop') await this.takedownPost(adminId, targetId, note);
      else if (targetKind === 'moment') await this.takedownMoment(adminId, targetId, note);
      else if (targetKind === 'comment') {
        await this.prisma.comment.updateMany({ where: { id: targetId }, data: { takenDownAt: new Date() } });
      } else if (targetKind === 'account') {
        await this.suspend(adminId, targetId, note || 'Taken down from moderation', suspendDays ?? null);
      }
    }
    if (kind === 'restore') {
      if (targetKind === 'post' || targetKind === 'loop') await this.restorePost(adminId, targetId);
      else if (targetKind === 'moment') {
        await this.prisma.moment.updateMany({ where: { id: targetId }, data: { takenDownAt: null } });
      } else if (targetKind === 'comment') {
        await this.prisma.comment.updateMany({ where: { id: targetId }, data: { takenDownAt: null } });
      } else if (targetKind === 'account') {
        await this.unsuspend(adminId, targetId);
      }
    }
    if (kind === 'suspend' && (targetKind === 'account' || targetKind === 'post' || targetKind === 'loop')) {
      const subject =
        targetKind === 'account'
          ? targetId
          : (await this.prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } }))?.authorId;
      if (subject) await this.suspend(adminId, subject, note || 'Suspended from moderation', suspendDays ?? null);
    }
    if (kind === 'unsuspend' && targetKind === 'account') await this.unsuspend(adminId, targetId);
    if (kind === 'mark_sensitive') {
      if (targetKind === 'post' || targetKind === 'loop') {
        await this.prisma.post.updateMany({ where: { id: targetId }, data: { sensitive: true } });
      }
      if (targetKind === 'moment') {
        await this.prisma.moment.updateMany({ where: { id: targetId }, data: { sensitive: true } });
      }
    }
    if (kind === 'unmark_sensitive') {
      if (targetKind === 'post' || targetKind === 'loop') {
        await this.prisma.post.updateMany({ where: { id: targetId }, data: { sensitive: false } });
      }
      if (targetKind === 'moment') {
        await this.prisma.moment.updateMany({ where: { id: targetId }, data: { sensitive: false } });
      }
    }
  }

  private async preview(kind: ReportTargetKind, id: string): Promise<Record<string, unknown> | null> {
    if (kind === 'post' || kind === 'loop') {
      const post = await this.prisma.post.findUnique({
        where: { id },
        select: { id: true, caption: true, kind: true, authorId: true, takenDownAt: true, sensitive: true },
      });
      return post;
    }
    if (kind === 'comment') {
      return this.prisma.comment.findUnique({
        where: { id },
        select: { id: true, body: true, authorId: true, postId: true, takenDownAt: true },
      });
    }
    if (kind === 'moment') {
      return this.prisma.moment.findUnique({
        where: { id },
        select: { id: true, authorId: true, takenDownAt: true, sensitive: true },
      });
    }
    if (kind === 'account') {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, handle: true, email: true, suspendedAt: true },
      });
      return user;
    }
    return { id, kind };
  }

  private async audit(
    adminId: string,
    action: string,
    targetKind: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    const subjectUserId = typeof payload.subjectUserId === 'string' ? payload.subjectUserId : null;
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetKind,
        targetId,
        subjectUserId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private toCard(row: {
    id: string;
    status: ModerationCaseCard['status'];
    source: ModerationCaseCard['source'];
    targetKind: ModerationCaseCard['targetKind'];
    targetId: string;
    summary: string;
    createdAt: Date;
    updatedAt: Date;
    subject: { handle: string } | null;
    assignedTo: { email: string } | null;
    _count: { reports: number };
  }): ModerationCaseCard {
    return {
      id: row.id,
      status: row.status,
      source: row.source,
      targetKind: row.targetKind,
      targetId: row.targetId,
      subjectHandle: row.subject?.handle ?? null,
      summary: row.summary,
      reportCount: row._count.reports,
      assignedTo: row.assignedTo?.email ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAppeal(row: {
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

  private async toLookup(user: {
    id: string;
    handle: string;
    email: string;
    isMinor: boolean;
    createdAt: Date;
    deactivatedAt: Date | null;
    suspendedAt: Date | null;
    suspendReason: string | null;
    profile: { displayName: string; isPrivate: boolean } | null;
  }): Promise<AdminUserLookup> {
    const [followers, following, posts, reports] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: user.id, status: 'accepted' } }),
      this.prisma.follow.count({ where: { followerId: user.id, status: 'accepted' } }),
      this.prisma.post.count({ where: { authorId: user.id, deletedAt: null } }),
      this.prisma.report.count({ where: { reportedUserId: user.id } }),
    ]);
    return {
      id: user.id,
      handle: user.handle,
      email: user.email,
      displayName: user.profile?.displayName ?? user.handle,
      isMinor: user.isMinor,
      isPrivate: user.profile?.isPrivate ?? false,
      deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      suspendReason: user.suspendReason,
      createdAt: user.createdAt.toISOString(),
      counts: { followers, following, posts, reports },
    };
  }
}

function cursorWhere(cursor: string): { OR: Array<Record<string, unknown>> } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = raw.lastIndexOf('|');
  const createdAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

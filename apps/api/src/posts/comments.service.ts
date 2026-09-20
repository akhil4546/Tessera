import { Injectable } from '@nestjs/common';
import {
  MAX_PINNED_COMMENTS,
  commentIsReplyAllowed,
  keywordHidden,
  parseCaption,
  restrictCommentHiddenFrom,
} from '@tessera/media';
import type { CommentView, Paginated } from '@tessera/types';
import { TesseraHttpError } from '../common/http-error.js';
import { encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SafetyService } from '../safety/safety.service.js';
import { PostsService } from './posts.service.js';
import { toAuthorPreview } from './posts.mapper.js';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
    private readonly safety: SafetyService,
  ) {}

  async list(postId: string, viewerId: string | undefined, cursor?: string, limit = 20): Promise<Paginated<CommentView>> {
    await this.posts.get(postId, viewerId);
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    const rows = await this.prisma.comment.findMany({
      where: { postId, parentId: null, ...(cursor ? cursorWhere(cursor) : {}) },
      orderBy: [{ pinnedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: commentInclude,
    });
    const slice = rows.slice(0, limit);
    const items: CommentView[] = [];
    for (const row of slice) {
      const view = await this.toView(row, viewerId, post.authorId);
      if (view) items.push(view);
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, postId: string, body: string, parentId?: string): Promise<CommentView> {
    await this.rateLimit.consume(`comment:${userId}`, 120, 60 * 60);
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Post not found.');
    await this.posts.get(postId, userId);
    if (!post.commentsEnabled && userId !== post.authorId) {
      throw new TesseraHttpError(403, 'COMMENTS_OFF', 'Comments are turned off.');
    }
    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.postId !== postId || parent.deletedAt) {
        throw new TesseraHttpError(404, 'NOT_FOUND', 'Parent comment not found.');
      }
      if (!commentIsReplyAllowed(parent)) {
        throw new TesseraHttpError(400, 'THREAD_DEPTH', 'Replies are one level deep.');
      }
    }
    await this.safety.assertCommentNotSpam(userId, body);
    const filters = await this.prisma.commentFilter.findMany({ where: { userId: post.authorId } });
    const hidden = keywordHidden(body, filters.map((row) => row.keyword));
    const global = await this.safety.applyTextFilters({
      text: body,
      authorId: userId,
      targetKind: 'comment',
      targetId: postId,
      subjectUserId: userId,
    });
    const restricted = userId !== post.authorId && (await this.safety.isRestricted(post.authorId, userId));
    const { mentions } = parseCaption(body);
    const created = await this.prisma.comment.create({
      data: {
        postId,
        authorId: userId,
        parentId: parentId ?? null,
        body,
        hiddenByFilter: hidden || global.hide,
        hiddenByRestrict: restricted,
      },
      include: commentInclude,
    });
    const preview = body.trim().slice(0, 140);
    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (parent) {
        await this.notifications.notify({
          recipientId: parent.authorId,
          actorId: userId,
          kind: 'reply',
          targetType: 'comment',
          targetId: parentId,
          preview,
          payload: { postId, commentId: created.id, parentId },
        });
      }
    } else {
      await this.notifications.notify({
        recipientId: post.authorId,
        actorId: userId,
        kind: 'comment',
        targetType: 'post',
        targetId: postId,
        preview,
        payload: { postId, commentId: created.id },
      });
    }
    if (mentions.length > 0) {
      const mentioned = await this.prisma.user.findMany({
        where: { handle: { in: mentions.map((handle) => handle.toLowerCase()) } },
        select: { id: true },
      });
      for (const user of mentioned) {
        await this.notifications.notify({
          recipientId: user.id,
          actorId: userId,
          kind: 'mention',
          targetType: 'comment',
          targetId: created.id,
          preview,
          payload: { postId, commentId: created.id },
        });
      }
    }
    const view = await this.toView(created, userId, post.authorId);
    if (!view) throw new TesseraHttpError(500, 'UNEXPECTED', 'Could not load comment.');
    return view;
  }

  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });
    if (!comment || comment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Comment not found.');
    if (comment.authorId !== userId && comment.post.authorId !== userId) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'You cannot delete that comment.');
    }
    await this.prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  }

  async pin(userId: string, commentId: string, pin: boolean): Promise<CommentView> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true, ...commentInclude },
    });
    if (!comment || comment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Comment not found.');
    if (comment.post.authorId !== userId) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the author can pin comments.');
    }
    if (comment.parentId) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Only top-level comments can be pinned.');
    }
    if (pin) {
      const pinned = await this.prisma.comment.count({
        where: { postId: comment.postId, pinnedAt: { not: null }, deletedAt: null },
      });
      if (!comment.pinnedAt && pinned >= MAX_PINNED_COMMENTS) {
        throw new TesseraHttpError(400, 'PIN_LIMIT', 'You can pin up to 3 comments.');
      }
    }
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { pinnedAt: pin ? new Date() : null },
      include: commentInclude,
    });
    const view = await this.toView(updated, userId, comment.post.authorId);
    if (!view) throw new TesseraHttpError(500, 'UNEXPECTED', 'Could not load comment.');
    return view;
  }

  async approveRestricted(userId: string, commentId: string): Promise<CommentView> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true, ...commentInclude },
    });
    if (!comment || comment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Comment not found.');
    if (comment.post.authorId !== userId) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the author can approve a restricted comment.');
    }
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { hiddenByRestrict: false, restrictApprovedAt: new Date() },
      include: commentInclude,
    });
    const view = await this.toView(updated, userId, comment.post.authorId);
    if (!view) throw new TesseraHttpError(500, 'UNEXPECTED', 'Could not load comment.');
    return view;
  }

  async like(userId: string, commentId: string, on: boolean): Promise<CommentView> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true, ...commentInclude },
    });
    if (!comment || comment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Comment not found.');
    await this.posts.get(comment.postId, userId);
    if (on) {
      await this.prisma.commentLike.upsert({
        where: { userId_commentId: { userId, commentId } },
        create: { userId, commentId },
        update: {},
      });
    } else {
      await this.prisma.commentLike.deleteMany({ where: { userId, commentId } });
    }
    const fresh = await this.prisma.comment.findUniqueOrThrow({
      where: { id: commentId },
      include: commentInclude,
    });
    const view = await this.toView(fresh, userId, comment.post.authorId);
    if (!view) throw new TesseraHttpError(500, 'UNEXPECTED', 'Could not load comment.');
    return view;
  }

  async setFilters(userId: string, keywords: string[]): Promise<{ keywords: string[] }> {
    const unique = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    await this.prisma.$transaction([
      this.prisma.commentFilter.deleteMany({ where: { userId } }),
      ...unique.map((keyword) => this.prisma.commentFilter.create({ data: { userId, keyword } })),
    ]);
    return { keywords: unique };
  }

  async listFilters(userId: string): Promise<{ keywords: string[] }> {
    const rows = await this.prisma.commentFilter.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return { keywords: rows.map((row) => row.keyword) };
  }

  private async toView(
    row: CommentRow,
    viewerId: string | undefined,
    postAuthorId: string,
  ): Promise<CommentView | null> {
    if (row.takenDownAt && viewerId !== postAuthorId && viewerId !== row.authorId) return null;
    const hiddenByKeyword = row.hiddenByFilter && viewerId !== postAuthorId && viewerId !== row.authorId;
    const hiddenByRestrict = restrictCommentHiddenFrom({
      hiddenByRestrict: Boolean(row.hiddenByRestrict),
      viewerId,
      postAuthorId,
      commentAuthorId: row.authorId,
    });
    const hidden = hiddenByKeyword || hiddenByRestrict;
    const replies: CommentView[] = [];
    for (const reply of row.replies ?? []) {
      const view = await this.toView(reply as CommentRow, viewerId, postAuthorId);
      if (view) replies.push(view);
    }
    return {
      id: row.id,
      postId: row.postId,
      parentId: row.parentId,
      body: row.deletedAt ? '' : hidden ? '' : row.body,
      author: toAuthorPreview({
        ...row.author,
        avatarUrl: await this.storage.signGet(row.author.profile?.avatarKey ?? null),
      }),
      pinned: Boolean(row.pinnedAt),
      hidden: Boolean(hidden),
      hiddenByRestrict: Boolean(row.hiddenByRestrict && viewerId === postAuthorId),
      deleted: Boolean(row.deletedAt),
      likeCount: row._count?.likes ?? row.likes?.length ?? 0,
      likedByMe: Boolean(viewerId && (row.likes ?? []).some((like) => like.userId === viewerId)),
      createdAt: row.createdAt.toISOString(),
      replies,
    };
  }
}

const commentInclude = {
  author: { include: { profile: true } },
  likes: true,
  _count: { select: { likes: true } },
  replies: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { include: { profile: true } },
      likes: true,
      _count: { select: { likes: true } },
    },
  },
};

type CommentRow = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  pinnedAt: Date | null;
  hiddenByFilter: boolean;
  hiddenByRestrict: boolean;
  takenDownAt?: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  authorId: string;
  author: { id: string; handle: string; profile: { displayName: string; avatarKey: string | null } | null };
  likes?: { userId: string }[];
  _count?: { likes: number };
  replies?: CommentRow[];
};

function cursorWhere(cursor: string): { OR: Array<Record<string, unknown>> } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = raw.lastIndexOf('|');
  const createdAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

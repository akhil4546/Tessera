import { Injectable } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import { canViewMoment, canViewPost, kindsForInboxFilter } from '@tessera/media';
import type {
  ConversationView,
  InboxBadge,
  InboxEntry,
  InboxFilter,
  InboxList,
  MessagePage,
  MessageSharePreview,
  MessageView,
  MessagingPrefs,
  Paginated,
  PresenceView,
  WhoCanMessage,
} from '@tessera/types';
import { E2E_VERSION_PLAINTEXT, MAX_GROUP_MEMBERS, QUICK_EMOJIS } from '@tessera/types';
import type {
  CreateConversationInput,
  CreateMessageInput,
  UpdateConversationInput,
  UpdateMessagingInput,
} from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { viewerInMomentCircles, viewerInPostCircles } from '../organisation/audience.js';
import { decodeCursor, encodeCursor } from '../common/pagination.js';
import { RateLimitService } from '../common/rate-limit.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { SafetyService } from '../safety/safety.service.js';
import { UsersService } from '../users/users.service.js';
import { conversationTitle, parsePayload, previewAuthor, receiptFor } from './inbox.mapper.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InboxRealtime } from './inbox.realtime.js';
import {
  canEditMessage,
  canUnsend,
  decideStartDirect,
  effectiveWhoCanMessage,
  groupOverCapacity,
  pairKey,
  readReceiptVisible,
} from './messaging.rules.js';

const MESSAGE_RATE = { limit: 60, window: 60 };
const THREAD_RATE = { limit: 20, window: 60 * 60 };

type MemberRow = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  lastReadMessageId: string | null;
  lastDeliveredMessageId: string | null;
  muted: boolean;
  leftAt: Date | null;
  hidden: boolean;
  user: {
    id: string;
    handle: string;
    profile: { displayName: string; avatarKey: string | null; activityStatusEnabled: boolean; readReceiptsEnabled: boolean } | null;
  };
};

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly realtime: InboxRealtime,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
    private readonly safety: SafetyService,
  ) {}

  async list(
    userId: string,
    filter: InboxFilter,
    cursor: string | undefined,
    limit: number,
  ): Promise<InboxList> {
    const kinds = kindsForInboxFilter(filter);
    const includeThreads = filter === 'all' || filter === 'messages' || filter === 'requests';
    const threadFilter: 'all' | 'messages' | 'requests' =
      filter === 'requests' ? 'requests' : filter === 'messages' ? 'messages' : 'all';
    const entries: InboxEntry[] = [];
    if (includeThreads) {
      for (const conversation of await this.listThreads(userId, threadFilter)) {
        entries.push({
          type: 'thread',
          conversation,
          sortAt: conversation.lastMessage?.createdAt ?? conversation.updatedAt,
        });
      }
    }
    if (kinds) {
      const activity = await this.notifications.listActivity(userId, filter, undefined, 200);
      for (const notification of activity.items) {
        entries.push({ type: 'activity', notification, sortAt: notification.updatedAt });
      }
    }
    entries.sort((a, b) => {
      const byTime = b.sortAt.localeCompare(a.sortAt);
      if (byTime !== 0) return byTime;
      const idA = a.type === 'thread' ? a.conversation.id : a.notification.id;
      const idB = b.type === 'thread' ? b.conversation.id : b.notification.id;
      return idB.localeCompare(idA);
    });

    let start = 0;
    if (cursor) {
      const { createdAt, id } = decodeCursor(cursor);
      start = entries.findIndex((entry) => {
        const time = new Date(entry.sortAt).getTime();
        const entryId = entry.type === 'thread' ? entry.conversation.id : entry.notification.id;
        return time < createdAt.getTime() || (time === createdAt.getTime() && entryId < id);
      });
      if (start < 0) start = entries.length;
    }
    const slice = entries.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const lastId = last
      ? last.type === 'thread'
        ? last.conversation.id
        : last.notification.id
      : null;
    return {
      items: slice,
      nextCursor:
        start + limit < entries.length && last && lastId
          ? encodeCursor(new Date(last.sortAt), lastId)
          : null,
      ...(await this.badge(userId)),
    };
  }

  private async listThreads(
    userId: string,
    filter: 'all' | 'messages' | 'requests',
  ): Promise<ConversationView[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null, hidden: false },
      include: {
        conversation: {
          include: {
            request: true,
            members: { where: { leftAt: null }, include: { user: { include: { profile: true } } } },
            messages: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              include: messageInclude,
            },
          },
        },
      },
    });

    const rows = memberships
      .map((row) => row.conversation)
      .filter((conversation) => {
        const request = conversation.request;
        const incomingPending = request?.status === 'pending' && request.toUserId === userId;
        const outgoingPending = request?.status === 'pending' && request.fromUserId === userId;
        const declinedIncoming = request?.status === 'declined' && request.toUserId === userId;
        if (declinedIncoming) return false;
        if (filter === 'requests') return incomingPending;
        if (filter === 'messages') return !incomingPending;
        return !declinedIncoming || outgoingPending;
      })
      .sort((a, b) => {
        const byTime = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
        return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
      });

    const items: ConversationView[] = [];
    for (const conversation of rows) {
      const mine = conversation.members.find((row) => row.userId === userId);
      if (!mine) continue;
      items.push(await this.toConversationView(conversation, mine, userId, conversation.messages[0] ?? null));
    }
    return items;
  }

  async badge(userId: string): Promise<InboxBadge> {
    const pendingRequests = await this.prisma.messageRequest.count({
      where: { toUserId: userId, status: 'pending' },
    });
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null, hidden: false },
      include: { conversation: { include: { request: true } } },
    });
    let unreadMessages = 0;
    for (const row of memberships) {
      const incomingPending =
        row.conversation.request?.status === 'pending' && row.conversation.request.toUserId === userId;
      if (incomingPending) continue;
      unreadMessages += await this.unreadCount(row.conversationId, userId, row.lastReadMessageId);
    }
    return {
      unreadMessages,
      pendingRequests,
      unreadActivity: await this.notifications.activityBadge(userId),
    };
  }

  async create(userId: string, input: CreateConversationInput): Promise<ConversationView> {
    await this.rateLimit.consume(`inbox:thread:${userId}`, THREAD_RATE.limit, THREAD_RATE.window);
    const handles = uniqueHandles([
      ...(input.handle ? [input.handle] : []),
      ...(input.handles ?? []),
    ]).filter((handle) => handle.length > 0);
    if (handles.length === 0) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Choose someone to write to.');
    }
    if (handles.length === 1) {
      return this.openDirect(userId, handles[0]!);
    }
    return this.openGroup(userId, handles, input.title);
  }

  async get(userId: string, conversationId: string): Promise<ConversationView> {
    const { conversation, mine } = await this.requireMember(userId, conversationId, { allowLeft: false });
    const last = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: messageInclude,
    });
    return this.toConversationView(conversation, mine, userId, last);
  }

  async update(userId: string, conversationId: string, input: UpdateConversationInput): Promise<ConversationView> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    if (input.title !== undefined) {
      if (conversation.kind !== 'group') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Only group threads have a name.');
      }
      if (mine.role === 'member') {
        throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the owner can rename this group.');
      }
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { title: input.title } });
    }
    if (input.muted !== undefined || input.hidden !== undefined) {
      await this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: {
          ...(input.muted !== undefined ? { muted: input.muted } : {}),
          ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        },
      });
    }
    return this.get(userId, conversationId);
  }

  async addMembers(userId: string, conversationId: string, handles: string[]): Promise<ConversationView> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    if (conversation.kind !== 'group') {
      throw new TesseraHttpError(400, 'VALIDATION', 'You can only add people to a group.');
    }
    if (mine.role === 'member') {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the owner can add people.');
    }
    const active = conversation.members.filter((row) => !row.leftAt);
    const unique = uniqueHandles(handles);
    if (groupOverCapacity(active.length, unique.length)) {
      throw new TesseraHttpError(400, 'VALIDATION', `Groups can have ${MAX_GROUP_MEMBERS} people.`);
    }
    for (const handle of unique) {
      const target = await this.users.loadByHandle(handle);
      if (active.some((row) => row.userId === target.id)) continue;
      await this.assertCanAdd(userId, target.id);
      const existing = conversation.members.find((row) => row.userId === target.id);
      if (existing?.leftAt) {
        await this.prisma.conversationMember.update({
          where: { conversationId_userId: { conversationId, userId: target.id } },
          data: { leftAt: null, hidden: false, role: 'member' },
        });
      } else {
        await this.prisma.conversationMember.create({
          data: { conversationId, userId: target.id, role: 'member' },
        });
      }
      await this.writeSystem(conversationId, userId, `@${target.handle} joined`);
    }
    return this.get(userId, conversationId);
  }

  async removeMember(userId: string, conversationId: string, handle: string): Promise<ConversationView> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    if (conversation.kind !== 'group' || mine.role === 'member') {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the owner can remove people.');
    }
    const target = await this.users.loadByHandle(handle);
    if (target.id === userId) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Leave the group instead of removing yourself.');
    }
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId: target.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    await this.writeSystem(conversationId, userId, `@${target.handle} left`);
    return this.get(userId, conversationId);
  }

  async leave(userId: string, conversationId: string): Promise<{ ok: true }> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { leftAt: new Date(), hidden: true },
    });
    if (conversation.kind === 'group') {
      await this.writeSystem(conversationId, userId, `@${mine.user.handle} left`);
    }
    return { ok: true };
  }

  async listMessages(userId: string, conversationId: string, cursor: string | undefined, limit: number): Promise<MessagePage> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    const extra = cursor
      ? (() => {
          const { createdAt, id } = decodeCursor(cursor);
          return {
            OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
          };
        })()
      : undefined;
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: messageInclude,
    });
    const lastInPage = rows[0];
    if (lastInPage) {
      await this.touchDelivered(conversationId, userId, lastInPage.id);
    }
    const slice = rows.slice(0, limit);
    const items: MessageView[] = [];
    for (const row of slice) {
      items.push(await this.toMessageView(row, conversation, mine, userId));
    }
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async send(userId: string, conversationId: string, input: CreateMessageInput): Promise<MessageView> {
    await this.rateLimit.consume(`inbox:msg:${userId}`, MESSAGE_RATE.limit, MESSAGE_RATE.window);
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    this.assertCanSend(conversation, userId);
    if (input.kind === 'text' && input.body) {
      await this.safety.assertMessageNotSpam(userId, input.body);
      await this.safety.applyTextFilters({
        text: input.body,
        authorId: userId,
        targetKind: 'message',
        targetId: conversationId,
        subjectUserId: userId,
      });
    }

    if (input.clientId) {
      const existing = await this.prisma.message.findUnique({
        where: { conversationId_clientId: { conversationId, clientId: input.clientId } },
        include: messageInclude,
      });
      if (existing) return this.toMessageView(existing, conversation, mine, userId);
    }

    const payload: { mediaId?: string; postId?: string; loopId?: string; momentId?: string; durationMs?: number } = {};
    let kind = input.kind;
    if (input.mediaId) {
      const media = await this.prisma.mediaItem.findUnique({ where: { id: input.mediaId } });
      if (!media || media.ownerId !== userId || media.purpose !== 'message') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Attach media you uploaded for this message.');
      }
      if (media.status !== 'ready') {
        throw new TesseraHttpError(409, 'MEDIA_NOT_READY', 'Wait until the attachment has finished processing.');
      }
      if (media.moderationHold) {
        throw new TesseraHttpError(403, 'MEDIA_HELD', 'That attachment is waiting on a human review.');
      }
      if (kind === 'text') kind = media.kind === 'audio' ? 'voice' : media.kind === 'video' ? 'video' : 'image';
      if (kind === 'voice' && media.kind !== 'audio') {
        throw new TesseraHttpError(400, 'VALIDATION', 'Voice notes need an audio attachment.');
      }
      payload.mediaId = media.id;
      if (media.durationMs) payload.durationMs = media.durationMs;
    }
    if (input.postId) {
      await this.assertSharePost(userId, input.postId);
      payload.postId = input.postId;
      kind = 'post';
    }
    if (input.loopId) {
      await this.assertShareLoop(userId, input.loopId);
      payload.loopId = input.loopId;
      kind = 'loop';
    }
    if (input.momentId) {
      await this.assertShareMoment(userId, input.momentId);
      payload.momentId = input.momentId;
      kind = 'moment';
    }
    if (input.replyToId) {
      const reply = await this.prisma.message.findFirst({
        where: { id: input.replyToId, conversationId },
      });
      if (!reply) throw new TesseraHttpError(400, 'VALIDATION', 'That message is not in this thread.');
    }

    const created = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        kind,
        body: input.body.trim(),
        bodyEncoding: 'plaintext',
        payload: payload as Prisma.InputJsonValue,
        replyToId: input.replyToId,
        clientId: input.clientId,
        ...(typeof payload.mediaId === 'string'
          ? { attachments: { create: { mediaId: payload.mediaId } } }
          : {}),
      },
      include: messageInclude,
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt, lastMessageId: created.id },
    });
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, leftAt: null },
      data: { hidden: false },
    });
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadMessageId: created.id, lastDeliveredMessageId: created.id },
    });

    const loaded = await this.prisma.message.findUniqueOrThrow({
      where: { id: created.id },
      include: messageInclude,
    });
    const view = await this.toMessageView(loaded, conversation, mine, userId);
    const memberIds = conversation.members.filter((row) => !row.leftAt).map((row) => row.userId);
    this.realtime.emitToUsers(memberIds, { type: 'message.new', conversationId, message: view });
    if (conversation.request?.status === 'pending' && conversation.request.toUserId !== userId) {
      const convo = await this.get(conversation.request.toUserId, conversationId);
      this.realtime.emitToUser(conversation.request.toUserId, { type: 'request.new', conversation: convo });
    }
    const badge = await this.badge(userId);
    this.realtime.emitToUser(userId, { type: 'inbox.badge', ...badge });
    return view;
  }

  async edit(userId: string, messageId: string, body: string): Promise<MessageView> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { ...messageInclude, conversation: { include: conversationInclude } },
    });
    if (!message) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
    const mine = message.conversation.members.find((row) => row.userId === userId && !row.leftAt);
    if (!mine) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    if (!canEditMessage({ senderId: message.senderId, actorId: userId, kind: message.kind, createdAt: message.createdAt, deletedAt: message.deletedAt })) {
      throw new TesseraHttpError(403, 'EDIT_WINDOW', 'You can edit a text message for 15 minutes.');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { body: body.trim(), editedAt: new Date() },
      include: messageInclude,
    });
    const view = await this.toMessageView(updated, message.conversation, mine, userId);
    this.realtime.emitToUsers(
      message.conversation.members.filter((row) => !row.leftAt).map((row) => row.userId),
      { type: 'message.edited', conversationId: message.conversationId, message: view },
    );
    return view;
  }

  async unsend(userId: string, messageId: string): Promise<MessageView> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { ...messageInclude, conversation: { include: conversationInclude } },
    });
    if (!message) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
    const mine = message.conversation.members.find((row) => row.userId === userId && !row.leftAt);
    if (!mine) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    if (!canUnsend({ senderId: message.senderId, actorId: userId })) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'You can only unsend your own messages.');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: '', payload: {}, ciphertext: null },
      include: messageInclude,
    });
    await this.prisma.messageAttachment.deleteMany({ where: { messageId } });
    await this.prisma.messageReaction.deleteMany({ where: { messageId } });
    const view = await this.toMessageView(updated, message.conversation, mine, userId);
    this.realtime.emitToUsers(
      message.conversation.members.filter((row) => !row.leftAt).map((row) => row.userId),
      { type: 'message.deleted', conversationId: message.conversationId, message: view },
    );
    return view;
  }

  async react(userId: string, messageId: string, emoji: string): Promise<MessageView> {
    if (!(QUICK_EMOJIS as readonly string[]).includes(emoji)) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Pick one of Tessera’s reaction tiles.');
    }
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: conversationInclude } },
    });
    if (!message || message.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
    const mine = message.conversation.members.find((row) => row.userId === userId && !row.leftAt);
    if (!mine) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    await this.prisma.messageReaction.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, emoji },
      update: { emoji },
    });
    const fresh = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    const view = await this.toMessageView(fresh, message.conversation, mine, userId);
    this.realtime.emitToUsers(
      message.conversation.members.filter((row) => !row.leftAt).map((row) => row.userId),
      { type: 'message.reaction', conversationId: message.conversationId, message: view },
    );
    return view;
  }

  async unreact(userId: string, messageId: string): Promise<MessageView> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: conversationInclude } },
    });
    if (!message) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
    const mine = message.conversation.members.find((row) => row.userId === userId && !row.leftAt);
    if (!mine) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    await this.prisma.messageReaction.deleteMany({ where: { messageId, userId } });
    const fresh = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
    return this.toMessageView(fresh, message.conversation, mine, userId);
  }

  async markRead(userId: string, conversationId: string, messageId: string): Promise<{ ok: true }> {
    const { conversation, mine } = await this.requireMember(userId, conversationId);
    const message = await this.prisma.message.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new TesseraHttpError(404, 'NOT_FOUND', 'Message not found.');
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadMessageId: messageId, lastDeliveredMessageId: messageId, hidden: false },
    });
    const prefs = await this.prefsFor(userId);
    const others = conversation.members.filter((row) => row.userId !== userId && !row.leftAt).map((row) => row.userId);
    if (readReceiptVisible({ readerId: userId, senderId: message.senderId, readerReceiptsEnabled: prefs.readReceiptsEnabled })) {
      this.realtime.emitToUsers(others, {
        type: 'receipt',
        conversationId,
        userId,
        readMessageId: messageId,
        deliveredMessageId: messageId,
      });
    } else {
      this.realtime.emitToUsers(others, {
        type: 'receipt',
        conversationId,
        userId,
        deliveredMessageId: messageId,
      });
    }
    void mine;
    return { ok: true };
  }

  async markDelivered(userId: string, conversationId: string, messageId: string): Promise<{ ok: true }> {
    await this.requireMember(userId, conversationId);
    await this.touchDelivered(conversationId, userId, messageId);
    return { ok: true };
  }

  async acceptRequest(userId: string, requestId: string): Promise<ConversationView> {
    const request = await this.prisma.messageRequest.findUnique({ where: { id: requestId } });
    if (!request || request.toUserId !== userId || request.status !== 'pending') {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No pending request.');
    }
    await this.prisma.messageRequest.update({
      where: { id: requestId },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    this.realtime.emitToUser(request.fromUserId, {
      type: 'conversation.updated',
      conversation: await this.get(request.fromUserId, request.conversationId),
    });
    return this.get(userId, request.conversationId);
  }

  async declineRequest(userId: string, requestId: string): Promise<{ ok: true }> {
    const request = await this.prisma.messageRequest.findUnique({ where: { id: requestId } });
    if (!request || request.toUserId !== userId || request.status !== 'pending') {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No pending request.');
    }
    await this.prisma.messageRequest.update({
      where: { id: requestId },
      data: { status: 'declined', respondedAt: new Date() },
    });
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: request.conversationId, userId },
      data: { hidden: true },
    });
    return { ok: true };
  }

  async getPrefs(userId: string): Promise<MessagingPrefs> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isMinor: true } });
    if (!profile || !user) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return {
      activityStatusEnabled: profile.activityStatusEnabled,
      readReceiptsEnabled: profile.readReceiptsEnabled,
      whoCanMessage: effectiveWhoCanMessage({
        whoCanMessage: profile.whoCanMessage,
        isMinor: user.isMinor,
      }),
    };
  }

  async setPrefs(userId: string, input: UpdateMessagingInput): Promise<MessagingPrefs> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isMinor: true } });
    if (!user) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (user.isMinor && input.whoCanMessage === 'everyone') {
      throw new TesseraHttpError(
        403,
        'MINOR_DM_LIMIT',
        'Accounts under 18 can only receive messages from people who follow them.',
      );
    }
    await this.prisma.profile.update({
      where: { userId },
      data: {
        ...(input.activityStatusEnabled !== undefined ? { activityStatusEnabled: input.activityStatusEnabled } : {}),
        ...(input.readReceiptsEnabled !== undefined ? { readReceiptsEnabled: input.readReceiptsEnabled } : {}),
        ...(input.whoCanMessage !== undefined ? { whoCanMessage: input.whoCanMessage } : {}),
      },
    });
    return this.getPrefs(userId);
  }

  async presence(viewerId: string, handlesCsv: string): Promise<{ items: PresenceView[] }> {
    const handles = uniqueHandles(handlesCsv.split(','));
    const items: PresenceView[] = [];
    for (const handle of handles) {
      const user = await this.prisma.user.findUnique({
        where: { handle: handle.toLowerCase() },
        include: { profile: true },
      });
      if (!user?.profile) continue;
      if (await this.users.isBlockedEitherWay(viewerId, user.id)) continue;
      const show = user.profile.activityStatusEnabled;
      const online = show ? await this.realtime.isOnline(user.id) : false;
      items.push({ handle: user.handle, online: show ? online : false });
    }
    return { items };
  }

  async replyToMoment(userId: string, momentId: string): Promise<ConversationView> {
    const moment = await this.prisma.moment.findUnique({
      where: { id: momentId },
      include: { author: { include: { profile: true } } },
    });
    if (!moment || moment.deletedAt) throw new TesseraHttpError(404, 'NOT_FOUND', 'Moment not found.');
    if (moment.authorId === userId) {
      throw new TesseraHttpError(400, 'SELF', 'That Moment is yours.');
    }
    const conversation = await this.openDirect(userId, moment.author.handle);
    await this.send(userId, conversation.id, {
      kind: 'moment',
      body: '',
      momentId,
    });
    return this.get(userId, conversation.id);
  }

  async onBlock(actorId: string, targetId: string): Promise<void> {
    const pair = pairKey(actorId, targetId);
    const direct = await this.prisma.conversationPair.findUnique({
      where: { userLowId_userHighId: pair },
    });
    if (direct) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId: direct.conversationId, userId: { in: [actorId, targetId] } },
        data: { leftAt: new Date(), hidden: true },
      });
      await this.prisma.messageRequest.updateMany({
        where: { conversationId: direct.conversationId, status: 'pending' },
        data: { status: 'declined', respondedAt: new Date() },
      });
    }
  }

  async heartbeat(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user?.profile?.activityStatusEnabled) return;
    await this.realtime.heartbeat(userId, user.handle);
  }

  typing(userId: string, handle: string, conversationId: string, memberIds: string[]): void {
    this.realtime.emitToUsers(memberIds, { type: 'typing', conversationId, handle }, userId);
  }

  private async openDirect(userId: string, handle: string): Promise<ConversationView> {
    const target = await this.users.loadByHandle(handle);
    const blocked = await this.users.isBlockedEitherWay(userId, target.id);
    const actorIsFollower = await this.users.isAcceptedFollower(userId, target.id);
    const decision = decideStartDirect({
      actorId: userId,
      targetId: target.id,
      blockedEitherWay: blocked,
      actorIsFollowerOfTarget: actorIsFollower,
      targetWhoCanMessage: (target.profile?.whoCanMessage ?? 'everyone') as WhoCanMessage,
      targetIsMinor: target.isMinor,
    });
    if (decision.type === 'error') {
      if (decision.code === 'SELF') throw new TesseraHttpError(400, 'SELF', 'You cannot message yourself.');
      if (decision.code === 'BLOCKED') throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
      throw new TesseraHttpError(403, 'MESSAGE_NOT_ALLOWED', 'They are not accepting messages from you.');
    }

    const pair = pairKey(userId, target.id);
    const existing = await this.prisma.conversationPair.findUnique({
      where: { userLowId_userHighId: pair },
      include: { conversation: { include: conversationInclude } },
    });
    if (existing) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId: existing.conversationId, userId, leftAt: { not: null } },
        data: { leftAt: null, hidden: false },
      });
      if (
        decision.request &&
        existing.conversation.request &&
        existing.conversation.request.status === 'declined' &&
        existing.conversation.request.toUserId === target.id
      ) {
        await this.prisma.messageRequest.update({
          where: { id: existing.conversation.request.id },
          data: { status: 'pending', fromUserId: userId, toUserId: target.id, respondedAt: null },
        });
      }
      return this.get(userId, existing.conversationId);
    }

    const created = await this.prisma.conversation.create({
      data: {
        kind: 'direct',
        createdById: userId,
        e2eVersion: E2E_VERSION_PLAINTEXT,
        members: {
          create: [
            { userId, role: 'owner' },
            { userId: target.id, role: 'member' },
          ],
        },
        pair: { create: pair },
        ...(decision.request
          ? { request: { create: { fromUserId: userId, toUserId: target.id, status: 'pending' } } }
          : {}),
      },
    });
    return this.get(userId, created.id);
  }

  private async openGroup(userId: string, handles: string[], title?: string): Promise<ConversationView> {
    const targets = [];
    for (const handle of handles) {
      const target = await this.users.loadByHandle(handle);
      if (target.id === userId) continue;
      await this.assertCanAdd(userId, target.id);
      targets.push(target);
    }
    const uniqueTargets = [...new Map(targets.map((row) => [row.id, row])).values()];
    if (uniqueTargets.length < 2) {
      throw new TesseraHttpError(400, 'VALIDATION', 'A group needs at least two other people.');
    }
    if (groupOverCapacity(1, uniqueTargets.length)) {
      throw new TesseraHttpError(400, 'VALIDATION', `Groups can have ${MAX_GROUP_MEMBERS} people.`);
    }
    const created = await this.prisma.conversation.create({
      data: {
        kind: 'group',
        title: title ?? null,
        createdById: userId,
        e2eVersion: E2E_VERSION_PLAINTEXT,
        members: {
          create: [
            { userId, role: 'owner' },
            ...uniqueTargets.map((row) => ({ userId: row.id, role: 'member' as const })),
          ],
        },
      },
    });
    await this.writeSystem(created.id, userId, 'Group started');
    return this.get(userId, created.id);
  }

  private async assertCanAdd(actorId: string, targetId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { profile: true },
    });
    if (!target?.profile) throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    const blocked = await this.users.isBlockedEitherWay(actorId, targetId);
    const actorIsFollower = await this.users.isAcceptedFollower(actorId, targetId);
    const decision = decideStartDirect({
      actorId,
      targetId,
      blockedEitherWay: blocked,
      actorIsFollowerOfTarget: actorIsFollower,
      targetWhoCanMessage: target.profile.whoCanMessage,
      targetIsMinor: target.isMinor,
    });
    if (decision.type === 'error' || decision.request) {
      throw new TesseraHttpError(
        403,
        'CANNOT_ADD',
        'You can only add people who already accept messages from you. Requests are 1:1 only.',
      );
    }
  }

  private assertCanSend(
    conversation: { request: { status: string; toUserId: string } | null; members: { userId: string; leftAt: Date | null }[] },
    userId: string,
  ): void {
    const mine = conversation.members.find((row) => row.userId === userId);
    if (!mine || mine.leftAt) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'You are not in this thread.');
    }
    if (conversation.request?.status === 'pending' && conversation.request.toUserId === userId) {
      throw new TesseraHttpError(403, 'REQUEST_PENDING', 'Accept this request before writing back.');
    }
    if (conversation.request?.status === 'declined') {
      throw new TesseraHttpError(403, 'REQUEST_DECLINED', 'This request was declined.');
    }
  }

  private async requireMember(userId: string, conversationId: string, opts?: { allowLeft?: boolean }) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude,
    });
    if (!conversation) throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    const mine = conversation.members.find((row) => row.userId === userId);
    if (!mine || (mine.leftAt && !opts?.allowLeft)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Thread not found.');
    }
    return { conversation, mine };
  }

  private async writeSystem(conversationId: string, senderId: string, body: string): Promise<void> {
    const created = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        kind: 'system',
        body,
        bodyEncoding: 'plaintext',
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt, lastMessageId: created.id },
    });
  }

  private async touchDelivered(conversationId: string, userId: string, messageId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastDeliveredMessageId: messageId },
    });
  }

  private async unreadCount(conversationId: string, userId: string, lastReadMessageId: string | null): Promise<number> {
    if (!lastReadMessageId) {
      return this.prisma.message.count({
        where: { conversationId, senderId: { not: userId }, deletedAt: null, kind: { not: 'system' } },
      });
    }
    const last = await this.prisma.message.findUnique({ where: { id: lastReadMessageId } });
    if (!last) {
      return this.prisma.message.count({
        where: { conversationId, senderId: { not: userId }, deletedAt: null, kind: { not: 'system' } },
      });
    }
    return this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        kind: { not: 'system' },
        OR: [{ createdAt: { gt: last.createdAt } }, { createdAt: last.createdAt, id: { gt: last.id } }],
      },
    });
  }

  private async prefsFor(userId: string): Promise<MessagingPrefs> {
    return this.getPrefs(userId);
  }

  private async assertSharePost(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: { include: { profile: true } } },
    });
    if (!post || !(await this.viewerCanSeePost(userId, post))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'That tile is not available.');
    }
  }

  private async assertShareLoop(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: { include: { profile: true } }, loop: true },
    });
    if (!post?.loop || !(await this.viewerCanSeePost(userId, post))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'That Loop is not available.');
    }
  }

  private async assertShareMoment(userId: string, momentId: string): Promise<void> {
    const moment = await this.prisma.moment.findUnique({
      where: { id: momentId },
      include: { author: { include: { profile: true } } },
    });
    if (!moment) throw new TesseraHttpError(404, 'NOT_FOUND', 'That Moment is not available.');
    const follows = await this.users.isAcceptedFollower(userId, moment.authorId);
    const blocked = await this.users.isBlockedEitherWay(userId, moment.authorId);
    if (
      !canViewMoment({
        authorId: moment.authorId,
        viewerId: userId,
        visibility: moment.visibility,
        authorPrivate: moment.author.profile?.isPrivate ?? false,
        viewerFollowsAuthor: follows,
        blockedEitherWay: blocked,
        published: Boolean(moment.publishedAt),
        expired: Boolean(moment.expiredAt) || Boolean(moment.expiresAt && moment.expiresAt < new Date()),
        deleted: Boolean(moment.deletedAt),
        keptVisible: false,
        archiveForAuthor: false,
        viewerInAuthorCircle: await viewerInMomentCircles(this.prisma, moment.id, userId),
      })
    ) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'That Moment is not available.');
    }
  }

  private async viewerCanSeePost(
    viewerId: string,
    post: {
      id: string;
      authorId: string;
      visibility: 'public' | 'followers' | 'circles';
      publishedAt: Date | null;
      deletedAt: Date | null;
      archivedAt: Date | null;
      author: { profile: { isPrivate: boolean } | null };
    },
  ): Promise<boolean> {
    const follows = await this.users.isAcceptedFollower(viewerId, post.authorId);
    const blocked = await this.users.isBlockedEitherWay(viewerId, post.authorId);
    return canViewPost({
      authorId: post.authorId,
      viewerId,
      visibility: post.visibility,
      authorPrivate: post.author.profile?.isPrivate ?? false,
      viewerFollowsAuthor: follows,
      blockedEitherWay: blocked,
      published: Boolean(post.publishedAt),
      deleted: Boolean(post.deletedAt),
      archived: Boolean(post.archivedAt),
      viewerInAuthorCircle: await viewerInPostCircles(this.prisma, post.id, viewerId),
    });
  }

  private async toConversationView(
    conversation: {
      id: string;
      kind: 'direct' | 'group';
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
      e2eVersion: number;
      request: { id: string; status: 'pending' | 'accepted' | 'declined'; fromUserId: string; toUserId: string } | null;
      members: MemberRow[];
    },
    mine: MemberRow,
    viewerId: string,
    lastMessage: Parameters<InboxService['toMessageView']>[0] | null,
  ): Promise<ConversationView> {
    const members = [];
    for (const row of conversation.members.filter((item) => !item.leftAt)) {
      const show = row.user.profile?.activityStatusEnabled ?? true;
      members.push({
        user: previewAuthor({
          ...row.user,
          avatarUrl: await this.storage.signGet(row.user.profile?.avatarKey ?? null),
        }),
        role: row.role,
        lastReadMessageId: row.lastReadMessageId,
        muted: row.muted,
        online: show ? await this.realtime.isOnline(row.userId) : null,
      });
    }
    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversationTitle(conversation.kind, conversation.title, members, viewerId),
      members,
      lastMessage: lastMessage ? await this.toMessageView(lastMessage, conversation, mine, viewerId) : null,
      unreadCount: await this.unreadCount(conversation.id, viewerId, mine.lastReadMessageId),
      muted: mine.muted,
      request: conversation.request
        ? {
            id: conversation.request.id,
            status: conversation.request.status,
            incoming: conversation.request.toUserId === viewerId,
          }
        : null,
      viewerRole: mine.role,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      e2eVersion: conversation.e2eVersion,
    };
  }

  private async toMessageView(
    message: {
      id: string;
      conversationId: string;
      senderId: string;
      kind: MessageView['kind'];
      body: string;
      bodyEncoding: 'plaintext' | 'ciphertext';
      payload: unknown;
      replyToId: string | null;
      editedAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
      clientId: string | null;
      sender: { id: string; handle: string; profile: { displayName: string; avatarKey: string | null } | null };
      replyTo?: {
        id: string;
        body: string;
        deletedAt: Date | null;
        sender: { handle: string };
      } | null;
      reactions?: { emoji: string; userId: string }[];
      attachments?: { media: Parameters<MediaService['toView']>[0] }[];
    },
    conversation: { kind: 'direct' | 'group'; e2eVersion?: number; members: MemberRow[] },
    mine: MemberRow,
    viewerId: string,
  ): Promise<MessageView> {
    const payload = parsePayload(message.payload);
    const deleted = Boolean(message.deletedAt);
    let mediaRow = message.attachments?.[0]?.media;
    if (!mediaRow && payload.mediaId && !deleted) {
      mediaRow = (await this.prisma.mediaItem.findUnique({ where: { id: payload.mediaId } })) ?? undefined;
    }
    const media = mediaRow && !deleted ? await this.media.toView(mediaRow) : null;
    const share = deleted ? null : await this.sharePreview(viewerId, payload);
    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const reaction of message.reactions ?? []) {
      const current = grouped.get(reaction.emoji) ?? { count: 0, mine: false };
      current.count += 1;
      if (reaction.userId === viewerId) current.mine = true;
      grouped.set(reaction.emoji, current);
    }
    const others = conversation.members.filter((row) => row.userId !== message.senderId && !row.leftAt);
    const other = others[0];
    const otherReceipts = other?.user.profile?.readReceiptsEnabled ?? true;
    const deliveredVisible =
      conversation.kind === 'direct' &&
      message.senderId === viewerId &&
      Boolean(other?.lastDeliveredMessageId) &&
      (other?.lastDeliveredMessageId === message.id ||
        (await this.messageIsAtLeast(other?.lastDeliveredMessageId, message.createdAt, message.id)));
    const readVisible =
      conversation.kind === 'direct' &&
      message.senderId === viewerId &&
      otherReceipts &&
      Boolean(other?.lastReadMessageId) &&
      (other?.lastReadMessageId === message.id ||
        (await this.messageIsAtLeast(other?.lastReadMessageId, message.createdAt, message.id)));

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: previewAuthor({
        ...message.sender,
        avatarUrl: await this.storage.signGet(message.sender.profile?.avatarKey ?? null),
      }),
      kind: message.kind,
      body: deleted ? '' : message.body,
      bodyEncoding: message.bodyEncoding,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            body: message.replyTo.deletedAt ? '' : message.replyTo.body,
            senderHandle: message.replyTo.sender.handle,
            deleted: Boolean(message.replyTo.deletedAt),
          }
        : null,
      media,
      share,
      reactions: [...grouped.entries()].map(([emoji, row]) => ({ emoji, count: row.count, mine: row.mine })),
      editedAt: message.editedAt?.toISOString() ?? null,
      deletedAt: message.deletedAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
      clientId: message.clientId,
      e2eVersion: conversation.e2eVersion ?? E2E_VERSION_PLAINTEXT,
      receipt: receiptFor({
        isOwn: message.senderId === viewerId,
        isDirect: conversation.kind === 'direct',
        delivered: Boolean(deliveredVisible),
        readVisible: Boolean(readVisible),
      }),
    };
  }

  private async sharePreview(viewerId: string, payload: ReturnType<typeof parsePayload>): Promise<MessageSharePreview | null> {
    if (payload.postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: payload.postId },
        include: { author: { include: { profile: true } } },
      });
      if (!post) return { kind: 'post', id: payload.postId, available: false, title: null, authorHandle: null, href: null };
      const available = await this.viewerCanSeePost(viewerId, post);
      return {
        kind: 'post',
        id: post.id,
        available,
        title: available ? post.caption.slice(0, 80) || 'Post' : null,
        authorHandle: available ? post.author.handle : null,
        href: available ? `/p/${post.id}` : null,
      };
    }
    if (payload.loopId) {
      const post = await this.prisma.post.findUnique({
        where: { id: payload.loopId },
        include: { author: { include: { profile: true } }, loop: true },
      });
      if (!post?.loop) {
        return { kind: 'loop', id: payload.loopId, available: false, title: null, authorHandle: null, href: null };
      }
      const available = await this.viewerCanSeePost(viewerId, post);
      return {
        kind: 'loop',
        id: post.id,
        available,
        title: available ? post.caption.slice(0, 80) || 'Loop' : null,
        authorHandle: available ? post.author.handle : null,
        href: available ? `/loops/${post.id}` : null,
      };
    }
    if (payload.momentId) {
      const moment = await this.prisma.moment.findUnique({
        where: { id: payload.momentId },
        include: { author: { include: { profile: true } } },
      });
      if (!moment) {
        return { kind: 'moment', id: payload.momentId, available: false, title: null, authorHandle: null, href: null };
      }
      try {
        await this.assertShareMoment(viewerId, moment.id);
        return {
          kind: 'moment',
          id: moment.id,
          available: true,
          title: 'Moment',
          authorHandle: moment.author.handle,
          href: `/u/${moment.author.handle}`,
        };
      } catch {
        return { kind: 'moment', id: moment.id, available: false, title: null, authorHandle: null, href: null };
      }
    }
    return null;
  }

  private async messageIsAtLeast(
    cursorId: string | null | undefined,
    createdAt: Date,
    messageId: string,
  ): Promise<boolean> {
    if (!cursorId) return false;
    if (cursorId === messageId) return true;
    const cursor = await this.prisma.message.findUnique({
      where: { id: cursorId },
      select: { createdAt: true, id: true },
    });
    if (!cursor) return false;
    return (
      cursor.createdAt.getTime() > createdAt.getTime() ||
      (cursor.createdAt.getTime() === createdAt.getTime() && cursor.id >= messageId)
    );
  }
}

const conversationInclude = {
  request: true,
  members: { include: { user: { include: { profile: true } } } },
} as const;

const messageInclude = {
  sender: { include: { profile: true } },
  replyTo: { include: { sender: true } },
  reactions: true,
  attachments: { include: { media: true } },
} as const;

function uniqueHandles(handles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of handles) {
    const handle = raw.trim().replace(/^@/, '').toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

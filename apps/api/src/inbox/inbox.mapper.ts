import type {
  AuthorPreview,
  ConversationMemberRole,
  ConversationMemberView,
  ConversationView,
  MessageKind,
  MessageReceiptView,
  MessageSharePreview,
  MessageView,
} from '@tessera/types';
import { toAuthorPreview } from '../posts/posts.mapper.js';

export type Payload = {
  mediaId?: string;
  postId?: string;
  loopId?: string;
  momentId?: string;
  durationMs?: number;
};

export function parsePayload(value: unknown): Payload {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  const str = (key: string) => (typeof row[key] === 'string' ? row[key] : undefined);
  const num = (key: string) => (typeof row[key] === 'number' ? row[key] : undefined);
  return {
    mediaId: str('mediaId'),
    postId: str('postId'),
    loopId: str('loopId'),
    momentId: str('momentId'),
    durationMs: num('durationMs'),
  };
}

export function previewAuthor(user: {
  id: string;
  handle: string;
  profile: { displayName: string } | null;
  avatarUrl?: string | null;
}): AuthorPreview {
  return toAuthorPreview(user);
}

export function memberView(input: {
  user: AuthorPreview;
  role: ConversationMemberRole;
  lastReadMessageId: string | null;
  muted: boolean;
  online: boolean | null;
}): ConversationMemberView {
  return input;
}

export function conversationTitle(
  kind: 'direct' | 'group',
  stored: string | null,
  members: ConversationMemberView[],
  viewerId: string,
): string | null {
  if (kind === 'group') return stored;
  const other = members.find((row) => row.user.id !== viewerId);
  return other?.user.displayName ?? stored;
}

export function emptyShare(kind: MessageSharePreview['kind'], id: string): MessageSharePreview {
  return {
    kind,
    id,
    available: false,
    title: null,
    authorHandle: null,
    href: null,
  };
}

export function receiptFor(input: {
  isOwn: boolean;
  isDirect: boolean;
  delivered: boolean;
  readVisible: boolean;
}): MessageReceiptView | null {
  if (!input.isOwn || !input.isDirect) return null;
  return { delivered: input.delivered, read: input.readVisible };
}

export function systemKind(): MessageKind {
  return 'system';
}

export type MappedConversation = ConversationView;
export type MappedMessage = MessageView;

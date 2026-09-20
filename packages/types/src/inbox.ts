import type { AuthorPreview, MediaView } from './post';
import type { InboxBadge, NotificationView } from './notification';

export const WHO_CAN_MESSAGE = ['everyone', 'followers', 'nobody'] as const;
export type WhoCanMessage = (typeof WHO_CAN_MESSAGE)[number];

export const CONVERSATION_KINDS = ['direct', 'group'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const CONVERSATION_ROLES = ['owner', 'admin', 'member'] as const;
export type ConversationMemberRole = (typeof CONVERSATION_ROLES)[number];

export const MESSAGE_KINDS = [
  'text',
  'image',
  'video',
  'voice',
  'post',
  'loop',
  'moment',
  'system',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const BODY_ENCODINGS = ['plaintext', 'ciphertext'] as const;
export type BodyEncoding = (typeof BODY_ENCODINGS)[number];

export const MESSAGE_REQUEST_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type MessageRequestStatus = (typeof MESSAGE_REQUEST_STATUSES)[number];

export const INBOX_FILTERS = [
  'all',
  'messages',
  'mentions',
  'appreciations',
  'follows',
  'requests',
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const MAX_GROUP_MEMBERS = 32;
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_MESSAGE_BODY = 4000;
export const MAX_VOICE_DURATION_MS = 60_000;
export const MAX_GROUP_TITLE = 80;
/** 0 = plaintext store. Future E2E bumps this and writes ciphertext. */
export const E2E_VERSION_PLAINTEXT = 0;

export type MessagingPrefs = {
  activityStatusEnabled: boolean;
  readReceiptsEnabled: boolean;
  whoCanMessage: WhoCanMessage;
};

export type ConversationMemberView = {
  user: AuthorPreview;
  role: ConversationMemberRole;
  lastReadMessageId: string | null;
  muted: boolean;
  /** Null when they hide activity status, or when the viewer is not allowed to see it. */
  online: boolean | null;
};

export type MessageSharePreview = {
  kind: 'post' | 'loop' | 'moment';
  id: string;
  available: boolean;
  title: string | null;
  authorHandle: string | null;
  href: string | null;
};

export type MessageReceiptView = {
  delivered: boolean;
  /** False when the other person has read receipts off, even if they have read it. */
  read: boolean;
};

export type MessageReactionView = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type MessageReplyPreview = {
  id: string;
  body: string;
  senderHandle: string;
  deleted: boolean;
};

export type MessageView = {
  id: string;
  conversationId: string;
  sender: AuthorPreview;
  kind: MessageKind;
  body: string;
  bodyEncoding: BodyEncoding;
  replyTo: MessageReplyPreview | null;
  media: MediaView | null;
  share: MessageSharePreview | null;
  reactions: MessageReactionView[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  clientId: string | null;
  e2eVersion: number;
  receipt: MessageReceiptView | null;
};

export type ConversationRequestView = {
  id: string;
  status: MessageRequestStatus;
  incoming: boolean;
};

export type ConversationView = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  members: ConversationMemberView[];
  lastMessage: MessageView | null;
  unreadCount: number;
  muted: boolean;
  request: ConversationRequestView | null;
  viewerRole: ConversationMemberRole;
  createdAt: string;
  updatedAt: string;
  e2eVersion: number;
};

export type InboxEntry =
  | { type: 'thread'; conversation: ConversationView; sortAt: string }
  | { type: 'activity'; notification: NotificationView; sortAt: string };

export type InboxList = InboxBadge & {
  items: InboxEntry[];
  nextCursor: string | null;
};

export type MessagePage = {
  items: MessageView[];
  nextCursor: string | null;
};

export type PresenceView = {
  handle: string;
  online: boolean;
};

export type InboxSocketEvent =
  | { type: 'message.new'; conversationId: string; message: MessageView }
  | { type: 'message.edited'; conversationId: string; message: MessageView }
  | { type: 'message.deleted'; conversationId: string; message: MessageView }
  | { type: 'message.reaction'; conversationId: string; message: MessageView }
  | { type: 'typing'; conversationId: string; handle: string }
  | { type: 'presence'; handle: string; online: boolean }
  | { type: 'receipt'; conversationId: string; userId: string; deliveredMessageId?: string; readMessageId?: string }
  | { type: 'conversation.updated'; conversation: ConversationView }
  | { type: 'request.new'; conversation: ConversationView }
  | { type: 'inbox.badge'; unreadMessages: number; pendingRequests: number; unreadActivity: number }
  | { type: 'notification.new'; notification: NotificationView };

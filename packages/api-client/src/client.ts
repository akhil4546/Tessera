import {
  apiErrorSchema,
  healthResponseSchema,
  type HealthResponse,
} from '@tessera/validation';
import type {
  BoardCard,
  BoardDetail,
  BoardSaveResult,
  BoardSearchPage,
  CircleDetail,
  CircleSummary,
  DraftView,
  AudioTrackView,
  AuthResult,
  AuthSuccess,
  CommentView,
  ConversationView,
  DiscoverFeed,
  HashtagPage,
  FollowingFeed,
  DeviceView,
  InboxBadge,
  InboxList,
  MessagePage,
  NotificationPage,
  NotificationPreferences,
  MessageView,
  MessagingPrefs,
  LoopsFeed,
  MemoryMapView,
  PlacePage,
  RankingWeights,
  RecentSearchView,
  SearchResults,
  SuggestedPerson,
  MeProfile,
  MediaIntent,
  MediaView,
  MomentAuthorReel,
  MomentCard,
  MomentTray,
  MomentViewerRow,
  MosaicView,
  Paginated,
  PostCard,
  PublicProfile,
  ReelShelfCard,
  ReelShelfDetail,
  SessionView,
  WellbeingView,
  AppealView,
  DeletionRequestView,
  ExportJobView,
  ReportView,
  SensitivityLevel,
} from '@tessera/types';
import { TesseraApiError } from './error';

export type CreateClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  credentials?: 'include' | 'omit' | 'same-origin';
  getAccessToken?: () => Promise<string | null> | string | null;
};

export type TesseraClient = {
  getHealth: () => Promise<HealthResponse>;
  register: (body: Record<string, unknown>) => Promise<AuthSuccess>;
  login: (body: Record<string, unknown>) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refresh: (body?: Record<string, unknown>) => Promise<AuthSuccess>;
  verifyEmail: (token: string) => Promise<MeProfile>;
  resendVerification: () => Promise<{ emailSent: boolean }>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyTwoFactor: (body: Record<string, unknown>) => Promise<AuthSuccess>;
  completeOauth: (body: Record<string, unknown>) => Promise<AuthSuccess>;
  setupTotp: () => Promise<{ otpauthUrl: string; secret: string }>;
  confirmTotp: (code: string) => Promise<{ recoveryCodes: string[] }>;
  disableTotp: (password: string, code: string) => Promise<void>;
  getMe: () => Promise<MeProfile>;
  updateMe: (body: Record<string, unknown>) => Promise<MeProfile>;
  updateHandle: (handle: string) => Promise<MeProfile>;
  updatePrivacy: (isPrivate: boolean) => Promise<MeProfile>;
  listSessions: () => Promise<SessionView[]>;
  revokeSession: (id: string) => Promise<void>;
  revokeOtherSessions: () => Promise<{ revoked: number }>;
  getProfile: (handle: string) => Promise<PublicProfile>;
  listFollowers: (handle: string) => Promise<Paginated<PublicProfile>>;
  listFollowing: (handle: string) => Promise<Paginated<PublicProfile>>;
  follow: (handle: string) => Promise<PublicProfile>;
  unfollow: (handle: string) => Promise<PublicProfile>;
  acceptFollow: (handle: string) => Promise<PublicProfile>;
  declineFollow: (handle: string) => Promise<void>;
  removeFollower: (handle: string) => Promise<PublicProfile>;
  listFollowRequests: () => Promise<Paginated<PublicProfile>>;
  block: (handle: string) => Promise<PublicProfile>;
  unblock: (handle: string) => Promise<PublicProfile>;
  mute: (handle: string, scope?: 'posts' | 'moments' | 'both') => Promise<PublicProfile>;
  unmute: (handle: string) => Promise<PublicProfile>;
  listBlocked: () => Promise<Paginated<PublicProfile>>;
  listMuted: () => Promise<Paginated<PublicProfile>>;
  restrict: (handle: string) => Promise<PublicProfile>;
  unrestrict: (handle: string) => Promise<PublicProfile>;
  listRestricted: () => Promise<Paginated<PublicProfile>>;
  createMediaIntent: (body: Record<string, unknown>) => Promise<MediaIntent>;
  uploadMediaBytes: (id: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string) => Promise<void>;
  completeMedia: (id: string) => Promise<MediaView>;
  getMedia: (id: string) => Promise<MediaView>;
  createPost: (body: Record<string, unknown>, idempotencyKey?: string) => Promise<PostCard>;
  getPost: (id: string) => Promise<PostCard>;
  updatePost: (id: string, body: Record<string, unknown>) => Promise<PostCard>;
  deletePost: (id: string) => Promise<void>;
  appreciate: (id: string, type: string) => Promise<PostCard>;
  unappreciate: (id: string) => Promise<PostCard>;
  listComments: (postId: string) => Promise<Paginated<CommentView>>;
  createComment: (postId: string, body: string, parentId?: string) => Promise<CommentView>;
  deleteComment: (id: string) => Promise<void>;
  pinComment: (id: string) => Promise<CommentView>;
  likeComment: (id: string, on: boolean) => Promise<CommentView>;
  followingFeed: (opts?: { cursor?: string; keepGoing?: boolean; limit?: number }) => Promise<FollowingFeed>;
  markCaughtUp: () => Promise<{ followingCaughtUpAt: string }>;
  mosaic: (handle: string) => Promise<MosaicView>;
  setHeroTiles: (postIds: string[]) => Promise<MosaicView>;
  setAvatar: (mediaId: string) => Promise<MeProfile>;
  createMoment: (body: Record<string, unknown>, idempotencyKey?: string) => Promise<MomentCard>;
  getMoment: (id: string) => Promise<MomentCard>;
  deleteMoment: (id: string) => Promise<void>;
  momentTray: () => Promise<MomentTray>;
  momentAuthorReel: (handle: string) => Promise<MomentAuthorReel>;
  momentArchive: () => Promise<{ items: MomentCard[] }>;
  viewMomentSegment: (momentId: string, segmentId: string) => Promise<MomentCard>;
  reactToMoment: (momentId: string, segmentId: string, emoji: string) => Promise<MomentCard>;
  unreactToMoment: (momentId: string, segmentId: string) => Promise<MomentCard>;
  momentViewers: (momentId: string) => Promise<{ items: MomentViewerRow[] }>;
  respondToSticker: (momentId: string, stickerId: string, body: Record<string, unknown>) => Promise<MomentCard>;
  keepMoment: (momentId: string, body: Record<string, unknown>) => Promise<ReelShelfDetail>;
  replyToMoment: (momentId: string) => Promise<ConversationView>;
  createReelShelf: (title: string) => Promise<ReelShelfCard>;
  listMyReelShelves: () => Promise<{ items: ReelShelfCard[] }>;
  updateReelShelf: (id: string, body: Record<string, unknown>) => Promise<ReelShelfCard>;
  deleteReelShelf: (id: string) => Promise<void>;
  orderReelShelves: (shelfIds: string[]) => Promise<{ items: ReelShelfCard[] }>;
  listReelShelves: (handle: string) => Promise<{ items: ReelShelfCard[] }>;
  getReelShelf: (handle: string, id: string) => Promise<ReelShelfDetail>;
  createLoop: (body: Record<string, unknown>, idempotencyKey?: string) => Promise<PostCard>;
  getLoop: (id: string) => Promise<PostCard>;
  updateLoop: (id: string, body: Record<string, unknown>) => Promise<PostCard>;
  loopsFeed: (opts?: { cursor?: string; limit?: number }) => Promise<LoopsFeed>;
  watchLoop: (id: string, seconds: number) => Promise<WellbeingView>;
  saveLoop: (id: string, boardId?: string) => Promise<BoardSaveResult>;
  savePost: (id: string, boardId?: string) => Promise<BoardSaveResult>;
  listCircles: () => Promise<{ items: CircleSummary[] }>;
  createCircle: (name: string) => Promise<CircleSummary>;
  getCircle: (id: string) => Promise<CircleDetail>;
  renameCircle: (id: string, name: string) => Promise<CircleSummary>;
  deleteCircle: (id: string) => Promise<void>;
  addCircleMember: (id: string, handle: string) => Promise<CircleDetail>;
  removeCircleMember: (id: string, handle: string) => Promise<CircleDetail>;
  listBoards: () => Promise<{ items: BoardCard[] }>;
  listFollowingBoards: () => Promise<{ items: BoardCard[] }>;
  createBoard: (body: Record<string, unknown>) => Promise<BoardCard>;
  getBoard: (id: string) => Promise<BoardDetail>;
  updateBoard: (id: string, body: Record<string, unknown>) => Promise<BoardCard>;
  deleteBoard: (id: string) => Promise<void>;
  removeBoardItem: (id: string, postId: string) => Promise<BoardCard>;
  followBoard: (id: string) => Promise<BoardCard>;
  unfollowBoard: (id: string) => Promise<BoardCard>;
  inviteBoardCollaborator: (id: string, handle: string) => Promise<BoardCard>;
  acceptBoardInvite: (id: string) => Promise<BoardCard>;
  declineBoardInvite: (id: string) => Promise<void>;
  removeBoardCollaborator: (id: string, handle: string) => Promise<BoardCard>;
  listPublicBoards: (handle: string) => Promise<{ items: BoardCard[] }>;
  searchBoards: (q: string) => Promise<BoardSearchPage>;
  listDrafts: () => Promise<Paginated<DraftView>>;
  createDraft: (body: Record<string, unknown>) => Promise<DraftView>;
  getDraft: (id: string) => Promise<DraftView>;
  updateDraft: (id: string, body: Record<string, unknown>) => Promise<DraftView>;
  deleteDraft: (id: string) => Promise<void>;
  listScheduled: () => Promise<{ items: PostCard[] }>;
  listAudio: (opts?: { cursor?: string; q?: string }) => Promise<Paginated<AudioTrackView>>;
  getWellbeing: () => Promise<WellbeingView>;
  setWellbeing: (body: {
    loopsBudgetMinutes?: number | null;
    dailyReminderMinutes?: number | null;
    sessionNudgeMinutes?: number | null;
  }) => Promise<WellbeingView>;
  wellbeingHeartbeat: (seconds: number) => Promise<WellbeingView>;
  dismissBreakNudge: () => Promise<void>;
  extendLoopsBudget: () => Promise<WellbeingView>;
  dismissLoopsBudget: () => Promise<WellbeingView>;
  search: (q: string, tab?: 'all' | 'people' | 'hashtags' | 'places' | 'captions' | 'boards') => Promise<SearchResults>;
  recentSearches: () => Promise<{ items: RecentSearchView[] }>;
  clearRecentSearches: () => Promise<void>;
  discoverFeed: (opts?: { cursor?: string; limit?: number; topic?: string }) => Promise<DiscoverFeed>;
  discoverWhy: (impressionId: string) => Promise<{
    impressionId: string;
    postId: string;
    score: number;
    signals: DiscoverFeed['items'][number]['signals'];
    weights: RankingWeights;
  }>;
  getDiscoverTuning: () => Promise<RankingWeights>;
  setDiscoverTuning: (body: Partial<RankingWeights>) => Promise<RankingWeights>;
  suggestedPeople: () => Promise<{ items: SuggestedPerson[] }>;
  dismissSuggestedPerson: (handle: string) => Promise<void>;
  hashtagPage: (tag: string, opts?: { sort?: 'top' | 'recent'; cursor?: string }) => Promise<HashtagPage>;
  followHashtag: (tag: string) => Promise<HashtagPage>;
  unfollowHashtag: (tag: string) => Promise<HashtagPage>;
  myHashtags: () => Promise<{ items: DiscoverFeed['topics'] }>;
  placePage: (slug: string, opts?: { sort?: 'top' | 'recent'; cursor?: string }) => Promise<PlacePage>;
  memoryMap: (handle: string) => Promise<MemoryMapView>;
  inbox: (opts?: {
    filter?: 'all' | 'messages' | 'mentions' | 'appreciations' | 'follows' | 'requests';
    cursor?: string;
    limit?: number;
  }) => Promise<InboxList>;
  inboxBadge: () => Promise<InboxBadge>;
  listNotifications: (opts?: {
    filter?: 'all' | 'mentions' | 'appreciations' | 'follows';
    cursor?: string;
    limit?: number;
  }) => Promise<NotificationPage>;
  markNotificationsRead: (body: { ids?: string[]; all?: boolean }) => Promise<{ read: number }>;
  getNotificationPreferences: () => Promise<NotificationPreferences>;
  setNotificationPreferences: (body: Record<string, unknown>) => Promise<NotificationPreferences>;
  listDevices: () => Promise<{ items: DeviceView[] }>;
  registerDevice: (body: Record<string, unknown>) => Promise<DeviceView>;
  removeDevice: (id: string) => Promise<void>;
  vapidPublicKey: () => Promise<{ publicKey: string | null; configured: boolean }>;
  createConversation: (body: Record<string, unknown>) => Promise<ConversationView>;
  getConversation: (id: string) => Promise<ConversationView>;
  updateConversation: (id: string, body: Record<string, unknown>) => Promise<ConversationView>;
  addConversationMembers: (id: string, handles: string[]) => Promise<ConversationView>;
  removeConversationMember: (id: string, handle: string) => Promise<ConversationView>;
  leaveConversation: (id: string) => Promise<void>;
  listMessages: (id: string, opts?: { cursor?: string; limit?: number }) => Promise<MessagePage>;
  sendMessage: (id: string, body: Record<string, unknown>) => Promise<MessageView>;
  editMessage: (id: string, body: string) => Promise<MessageView>;
  unsendMessage: (id: string) => Promise<MessageView>;
  reactToMessage: (id: string, emoji: string) => Promise<MessageView>;
  unreactToMessage: (id: string) => Promise<MessageView>;
  markConversationRead: (id: string, messageId: string) => Promise<void>;
  markConversationDelivered: (id: string, messageId: string) => Promise<void>;
  acceptMessageRequest: (id: string) => Promise<ConversationView>;
  declineMessageRequest: (id: string) => Promise<void>;
  reportConversation: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportMessage: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportPost: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportComment: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportMoment: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportLoop: (id: string, reason: string, details?: string) => Promise<ReportView>;
  reportAccount: (handle: string, reason: string, details?: string) => Promise<ReportView>;
  approveComment: (id: string) => Promise<CommentView>;
  setSensitivity: (sensitivityLevel: SensitivityLevel) => Promise<MeProfile>;
  requestExport: () => Promise<ExportJobView>;
  listExports: () => Promise<{ items: ExportJobView[] }>;
  getExport: (id: string) => Promise<ExportJobView>;
  requestDeletion: (password: string) => Promise<DeletionRequestView>;
  cancelDeletion: () => Promise<void>;
  createAppeal: (caseId: string, statement: string) => Promise<AppealView>;
  listAppeals: () => Promise<{ items: AppealView[] }>;
  getMessagingPrefs: () => Promise<MessagingPrefs>;
  setMessagingPrefs: (body: Partial<MessagingPrefs>) => Promise<MessagingPrefs>;
  inboxPresence: (handles: string[]) => Promise<{ items: { handle: string; online: boolean }[] }>;
};

export function createClient(options: CreateClientOptions): TesseraClient {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = await options.getAccessToken?.();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: options.credentials ?? init.credentials,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      const message = parsed.success ? parsed.data.error.message : `Request failed: ${response.status}`;
      throw new TesseraApiError(message, response.status, body);
    }
    return body;
  }

  function post(path: string, body?: unknown) {
    return request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  return {
    async getHealth() {
      const body = await request('/health');
      return healthResponseSchema.parse(body);
    },
    async register(body) {
      return (await post('/v1/auth/register', body)) as AuthSuccess;
    },
    async login(body) {
      return (await post('/v1/auth/login', body)) as AuthResult;
    },
    async logout() {
      await post('/v1/auth/logout', {});
    },
    async refresh(body = {}) {
      return (await post('/v1/auth/refresh', body)) as AuthSuccess;
    },
    async verifyEmail(token) {
      const body = (await post('/v1/auth/verify-email', { token })) as { user: MeProfile };
      return body.user;
    },
    async resendVerification() {
      return (await post('/v1/auth/resend-verification', {})) as { emailSent: boolean };
    },
    async forgotPassword(email) {
      await post('/v1/auth/forgot-password', { email });
    },
    async resetPassword(token, password) {
      await post('/v1/auth/reset-password', { token, password });
    },
    async verifyTwoFactor(body) {
      return (await post('/v1/auth/2fa/verify', body)) as AuthSuccess;
    },
    async completeOauth(body) {
      return (await post('/v1/auth/oauth/complete', body)) as AuthSuccess;
    },
    async setupTotp() {
      return (await post('/v1/auth/2fa/setup')) as { otpauthUrl: string; secret: string };
    },
    async confirmTotp(code) {
      return (await post('/v1/auth/2fa/confirm', { code })) as { recoveryCodes: string[] };
    },
    async disableTotp(password, code) {
      await post('/v1/auth/2fa/disable', { password, code });
    },
    async getMe() {
      return (await request('/v1/me')) as MeProfile;
    },
    async updateMe(body) {
      return (await request('/v1/me', { method: 'PATCH', body: JSON.stringify(body) })) as MeProfile;
    },
    async updateHandle(handle) {
      return (await request('/v1/me/handle', {
        method: 'PATCH',
        body: JSON.stringify({ handle }),
      })) as MeProfile;
    },
    async updatePrivacy(isPrivate) {
      return (await request('/v1/me/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ isPrivate }),
      })) as MeProfile;
    },
    async listSessions() {
      return (await request('/v1/me/sessions')) as SessionView[];
    },
    async revokeSession(id) {
      await request(`/v1/me/sessions/${id}`, { method: 'DELETE' });
    },
    async revokeOtherSessions() {
      return (await post('/v1/me/sessions/revoke-others')) as { revoked: number };
    },
    async getProfile(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}`)) as PublicProfile;
    },
    async listFollowers(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/followers`)) as Paginated<PublicProfile>;
    },
    async listFollowing(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/following`)) as Paginated<PublicProfile>;
    },
    async follow(handle) {
      return (await post(`/v1/users/${encodeURIComponent(handle)}/follow`)) as PublicProfile;
    },
    async unfollow(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/follow`, {
        method: 'DELETE',
      })) as PublicProfile;
    },
    async acceptFollow(handle) {
      return (await post(`/v1/users/${encodeURIComponent(handle)}/follow/accept`)) as PublicProfile;
    },
    async declineFollow(handle) {
      await post(`/v1/users/${encodeURIComponent(handle)}/follow/decline`);
    },
    async removeFollower(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/follower`, {
        method: 'DELETE',
      })) as PublicProfile;
    },
    async listFollowRequests() {
      return (await request('/v1/me/follow-requests')) as Paginated<PublicProfile>;
    },
    async block(handle) {
      return (await post(`/v1/users/${encodeURIComponent(handle)}/block`)) as PublicProfile;
    },
    async unblock(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/block`, {
        method: 'DELETE',
      })) as PublicProfile;
    },
    async mute(handle, scope = 'both') {
      return (await post(`/v1/users/${encodeURIComponent(handle)}/mute`, { scope })) as PublicProfile;
    },
    async unmute(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/mute`, {
        method: 'DELETE',
      })) as PublicProfile;
    },
    async listBlocked() {
      return (await request('/v1/me/blocked')) as Paginated<PublicProfile>;
    },
    async listMuted() {
      return (await request('/v1/me/muted')) as Paginated<PublicProfile>;
    },
    async restrict(handle) {
      return (await post(`/v1/users/${handle}/restrict`)) as PublicProfile;
    },
    async unrestrict(handle) {
      await request(`/v1/users/${handle}/restrict`, { method: 'DELETE' });
      return (await request(`/v1/users/${handle}`)) as PublicProfile;
    },
    async listRestricted() {
      return (await request('/v1/me/restricted')) as Paginated<PublicProfile>;
    },
    async createMediaIntent(body) {
      return (await post('/v1/media/intents', body)) as MediaIntent;
    },
    async uploadMediaBytes(id, body, contentType) {
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      const token = await options.getAccessToken?.();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const payload: Blob | ArrayBuffer | Uint8Array =
        typeof Blob !== 'undefined' && body instanceof Blob
          ? body
          : body instanceof ArrayBuffer
            ? body
            : body;
      const response = await fetchImpl(`${baseUrl}/v1/media/${id}/bytes`, {
        method: 'POST',
        headers,
        body: payload as never,
        credentials: options.credentials,
      });
      if (!response.ok) {
        throw new TesseraApiError(`Upload failed: ${response.status}`, response.status, await response.json().catch(() => null));
      }
    },
    async completeMedia(id) {
      return (await post(`/v1/media/${id}/complete`)) as MediaView;
    },
    async getMedia(id) {
      return (await request(`/v1/media/${id}`)) as MediaView;
    },
    async createPost(body, idempotencyKey) {
      return (await request('/v1/posts', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      })) as PostCard;
    },
    async getPost(id) {
      return (await request(`/v1/posts/${id}`)) as PostCard;
    },
    async updatePost(id, body) {
      return (await request(`/v1/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as PostCard;
    },
    async deletePost(id) {
      await request(`/v1/posts/${id}`, { method: 'DELETE' });
    },
    async appreciate(id, type) {
      return (await post(`/v1/posts/${id}/appreciations`, { type })) as PostCard;
    },
    async unappreciate(id) {
      return (await request(`/v1/posts/${id}/appreciations`, { method: 'DELETE' })) as PostCard;
    },
    async listComments(postId) {
      return (await request(`/v1/posts/${postId}/comments`)) as Paginated<CommentView>;
    },
    async createComment(postId, body, parentId) {
      return (await post(`/v1/posts/${postId}/comments`, { body, parentId })) as CommentView;
    },
    async deleteComment(id) {
      await request(`/v1/comments/${id}`, { method: 'DELETE' });
    },
    async pinComment(id) {
      return (await post(`/v1/comments/${id}/pin`)) as CommentView;
    },
    async likeComment(id, on) {
      return (await request(`/v1/comments/${id}/like`, { method: on ? 'POST' : 'DELETE' })) as CommentView;
    },
    async followingFeed(opts = {}) {
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.keepGoing) params.set('keepGoing', 'true');
      if (opts.limit) params.set('limit', String(opts.limit));
      const q = params.toString();
      return (await request(`/v1/feed/following${q ? `?${q}` : ''}`)) as FollowingFeed;
    },
    async markCaughtUp() {
      return (await post('/v1/feed/following/caught-up')) as { followingCaughtUpAt: string };
    },
    async mosaic(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/mosaic`)) as MosaicView;
    },
    async setHeroTiles(postIds) {
      return (await request('/v1/me/hero-tiles', {
        method: 'PUT',
        body: JSON.stringify({ postIds }),
      })) as MosaicView;
    },
    async setAvatar(mediaId) {
      return (await post('/v1/me/avatar', { mediaId })) as MeProfile;
    },
    async createMoment(body, idempotencyKey) {
      return (await request('/v1/moments', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      })) as MomentCard;
    },
    async getMoment(id) {
      return (await request(`/v1/moments/${id}`)) as MomentCard;
    },
    async deleteMoment(id) {
      await request(`/v1/moments/${id}`, { method: 'DELETE' });
    },
    async momentTray() {
      return (await request('/v1/moments/tray')) as MomentTray;
    },
    async momentAuthorReel(handle) {
      return (await request(`/v1/moments/authors/${encodeURIComponent(handle)}`)) as MomentAuthorReel;
    },
    async momentArchive() {
      return (await request('/v1/me/moments/archive')) as { items: MomentCard[] };
    },
    async viewMomentSegment(momentId, segmentId) {
      return (await post(`/v1/moments/${momentId}/segments/${segmentId}/view`)) as MomentCard;
    },
    async reactToMoment(momentId, segmentId, emoji) {
      return (await post(`/v1/moments/${momentId}/segments/${segmentId}/reactions`, { emoji })) as MomentCard;
    },
    async unreactToMoment(momentId, segmentId) {
      return (await request(`/v1/moments/${momentId}/segments/${segmentId}/reactions`, {
        method: 'DELETE',
      })) as MomentCard;
    },
    async momentViewers(momentId) {
      return (await request(`/v1/moments/${momentId}/viewers`)) as { items: MomentViewerRow[] };
    },
    async respondToSticker(momentId, stickerId, body) {
      return (await post(`/v1/moments/${momentId}/stickers/${stickerId}/responses`, body)) as MomentCard;
    },
    async keepMoment(momentId, body) {
      return (await post(`/v1/moments/${momentId}/keep`, body)) as ReelShelfDetail;
    },
    async replyToMoment(momentId) {
      return (await post(`/v1/moments/${momentId}/reply`)) as ConversationView;
    },
    async createReelShelf(title) {
      return (await post('/v1/me/reel-shelves', { title })) as ReelShelfCard;
    },
    async listMyReelShelves() {
      return (await request('/v1/me/reel-shelves')) as { items: ReelShelfCard[] };
    },
    async updateReelShelf(id, body) {
      return (await request(`/v1/me/reel-shelves/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as ReelShelfCard;
    },
    async deleteReelShelf(id) {
      await request(`/v1/me/reel-shelves/${id}`, { method: 'DELETE' });
    },
    async orderReelShelves(shelfIds) {
      return (await request('/v1/me/reel-shelves/order', {
        method: 'PUT',
        body: JSON.stringify({ shelfIds }),
      })) as { items: ReelShelfCard[] };
    },
    async listReelShelves(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/reel-shelves`)) as {
        items: ReelShelfCard[];
      };
    },
    async getReelShelf(handle, id) {
      return (await request(
        `/v1/users/${encodeURIComponent(handle)}/reel-shelves/${id}`,
      )) as ReelShelfDetail;
    },
    async createLoop(body, idempotencyKey) {
      return (await request('/v1/loops', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      })) as PostCard;
    },
    async getLoop(id) {
      return (await request(`/v1/loops/${id}`)) as PostCard;
    },
    async updateLoop(id, body) {
      return (await request(`/v1/loops/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as PostCard;
    },
    async loopsFeed(opts = {}) {
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      const q = params.toString();
      return (await request(`/v1/loops/feed${q ? `?${q}` : ''}`)) as LoopsFeed;
    },
    async watchLoop(id, seconds) {
      return (await post(`/v1/loops/${id}/watch`, { seconds })) as WellbeingView;
    },
    async saveLoop(id, boardId) {
      return (await post(`/v1/loops/${id}/save`, boardId ? { boardId } : {})) as BoardSaveResult;
    },
    async savePost(id, boardId) {
      return (await post(`/v1/posts/${id}/save`, boardId ? { boardId } : {})) as BoardSaveResult;
    },
    async listCircles() {
      return (await request('/v1/me/circles')) as { items: CircleSummary[] };
    },
    async createCircle(name) {
      return (await post('/v1/me/circles', { name })) as CircleSummary;
    },
    async getCircle(id) {
      return (await request(`/v1/me/circles/${id}`)) as CircleDetail;
    },
    async renameCircle(id, name) {
      return (await request(`/v1/me/circles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })) as CircleSummary;
    },
    async deleteCircle(id) {
      await request(`/v1/me/circles/${id}`, { method: 'DELETE' });
    },
    async addCircleMember(id, handle) {
      return (await post(`/v1/me/circles/${id}/members`, { handle })) as CircleDetail;
    },
    async removeCircleMember(id, handle) {
      return (await request(`/v1/me/circles/${id}/members/${encodeURIComponent(handle)}`, {
        method: 'DELETE',
      })) as CircleDetail;
    },
    async listBoards() {
      return (await request('/v1/me/boards')) as { items: BoardCard[] };
    },
    async listFollowingBoards() {
      return (await request('/v1/me/boards/following')) as { items: BoardCard[] };
    },
    async createBoard(body) {
      return (await post('/v1/boards', body)) as BoardCard;
    },
    async getBoard(id) {
      return (await request(`/v1/boards/${id}`)) as BoardDetail;
    },
    async updateBoard(id, body) {
      return (await request(`/v1/boards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as BoardCard;
    },
    async deleteBoard(id) {
      await request(`/v1/boards/${id}`, { method: 'DELETE' });
    },
    async removeBoardItem(id, postId) {
      return (await request(`/v1/boards/${id}/items/${postId}`, { method: 'DELETE' })) as BoardCard;
    },
    async followBoard(id) {
      return (await post(`/v1/boards/${id}/follow`)) as BoardCard;
    },
    async unfollowBoard(id) {
      return (await request(`/v1/boards/${id}/follow`, { method: 'DELETE' })) as BoardCard;
    },
    async inviteBoardCollaborator(id, handle) {
      return (await post(`/v1/boards/${id}/collaborators`, { handle })) as BoardCard;
    },
    async acceptBoardInvite(id) {
      return (await post(`/v1/boards/${id}/accept`)) as BoardCard;
    },
    async declineBoardInvite(id) {
      await post(`/v1/boards/${id}/decline`);
    },
    async removeBoardCollaborator(id, handle) {
      return (await request(`/v1/boards/${id}/collaborators/${encodeURIComponent(handle)}`, {
        method: 'DELETE',
      })) as BoardCard;
    },
    async listPublicBoards(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/boards`)) as { items: BoardCard[] };
    },
    async searchBoards(q) {
      return (await request(`/v1/search/boards?q=${encodeURIComponent(q)}`)) as BoardSearchPage;
    },
    async listDrafts() {
      return (await request('/v1/drafts')) as Paginated<DraftView>;
    },
    async createDraft(body) {
      return (await post('/v1/drafts', body)) as DraftView;
    },
    async getDraft(id) {
      return (await request(`/v1/drafts/${id}`)) as DraftView;
    },
    async updateDraft(id, body) {
      return (await request(`/v1/drafts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as DraftView;
    },
    async deleteDraft(id) {
      await request(`/v1/drafts/${id}`, { method: 'DELETE' });
    },
    async listScheduled() {
      return (await request('/v1/me/scheduled')) as { items: PostCard[] };
    },
    async listAudio(opts = {}) {
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.q) params.set('q', opts.q);
      const q = params.toString();
      return (await request(`/v1/audio${q ? `?${q}` : ''}`)) as Paginated<AudioTrackView>;
    },
    async getWellbeing() {
      return (await request('/v1/me/wellbeing')) as WellbeingView;
    },
    async setWellbeing(body) {
      return (await request('/v1/me/wellbeing', {
        method: 'PUT',
        body: JSON.stringify(body),
      })) as WellbeingView;
    },
    async wellbeingHeartbeat(seconds) {
      return (await post('/v1/me/wellbeing/heartbeat', { seconds })) as WellbeingView;
    },
    async dismissBreakNudge() {
      await post('/v1/me/wellbeing/break');
    },
    async extendLoopsBudget() {
      return (await post('/v1/me/wellbeing/extend')) as WellbeingView;
    },
    async dismissLoopsBudget() {
      return (await post('/v1/me/wellbeing/dismiss')) as WellbeingView;
    },
    async search(q, tab = 'all') {
      const params = new URLSearchParams({ q, tab });
      return (await request(`/v1/search?${params}`)) as SearchResults;
    },
    async recentSearches() {
      return (await request('/v1/search/recent')) as { items: RecentSearchView[] };
    },
    async clearRecentSearches() {
      await request('/v1/search/recent', { method: 'DELETE' });
    },
    async discoverFeed(opts = {}) {
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.topic) params.set('topic', opts.topic);
      const q = params.toString();
      return (await request(`/v1/feed/discover${q ? `?${q}` : ''}`)) as DiscoverFeed;
    },
    async discoverWhy(impressionId) {
      return (await request(`/v1/feed/discover/impressions/${impressionId}`)) as {
        impressionId: string;
        postId: string;
        score: number;
        signals: DiscoverFeed['items'][number]['signals'];
        weights: RankingWeights;
      };
    },
    async getDiscoverTuning() {
      return (await request('/v1/me/discover')) as RankingWeights;
    },
    async setDiscoverTuning(body) {
      return (await request('/v1/me/discover', {
        method: 'PUT',
        body: JSON.stringify(body),
      })) as RankingWeights;
    },
    async suggestedPeople() {
      return (await request('/v1/discover/people')) as { items: SuggestedPerson[] };
    },
    async dismissSuggestedPerson(handle) {
      await post(`/v1/discover/people/${encodeURIComponent(handle)}/dismiss`);
    },
    async hashtagPage(tag, opts = {}) {
      const params = new URLSearchParams();
      if (opts.sort) params.set('sort', opts.sort);
      if (opts.cursor) params.set('cursor', opts.cursor);
      const q = params.toString();
      return (await request(`/v1/hashtags/${encodeURIComponent(tag)}${q ? `?${q}` : ''}`)) as HashtagPage;
    },
    async followHashtag(tag) {
      return (await post(`/v1/hashtags/${encodeURIComponent(tag)}/follow`)) as HashtagPage;
    },
    async unfollowHashtag(tag) {
      return (await request(`/v1/hashtags/${encodeURIComponent(tag)}/follow`, {
        method: 'DELETE',
      })) as HashtagPage;
    },
    async myHashtags() {
      return (await request('/v1/me/hashtags')) as { items: DiscoverFeed['topics'] };
    },
    async placePage(slug, opts = {}) {
      const params = new URLSearchParams();
      if (opts.sort) params.set('sort', opts.sort);
      if (opts.cursor) params.set('cursor', opts.cursor);
      const q = params.toString();
      return (await request(`/v1/places/${encodeURIComponent(slug)}${q ? `?${q}` : ''}`)) as PlacePage;
    },
    async memoryMap(handle) {
      return (await request(`/v1/users/${encodeURIComponent(handle)}/memory-map`)) as MemoryMapView;
    },
    async inbox(opts = {}) {
      const params = new URLSearchParams();
      if (opts.filter) params.set('filter', opts.filter);
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      const q = params.toString();
      return (await request(`/v1/inbox${q ? `?${q}` : ''}`)) as InboxList;
    },
    async createConversation(body) {
      return (await post('/v1/inbox/conversations', body)) as ConversationView;
    },
    async getConversation(id) {
      return (await request(`/v1/inbox/conversations/${id}`)) as ConversationView;
    },
    async updateConversation(id, body) {
      return (await request(`/v1/inbox/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as ConversationView;
    },
    async addConversationMembers(id, handles) {
      return (await post(`/v1/inbox/conversations/${id}/members`, { handles })) as ConversationView;
    },
    async removeConversationMember(id, handle) {
      return (await request(`/v1/inbox/conversations/${id}/members/${encodeURIComponent(handle)}`, {
        method: 'DELETE',
      })) as ConversationView;
    },
    async leaveConversation(id) {
      await post(`/v1/inbox/conversations/${id}/leave`);
    },
    async listMessages(id, opts = {}) {
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      const q = params.toString();
      return (await request(
        `/v1/inbox/conversations/${id}/messages${q ? `?${q}` : ''}`,
      )) as MessagePage;
    },
    async sendMessage(id, body) {
      return (await post(`/v1/inbox/conversations/${id}/messages`, body)) as MessageView;
    },
    async editMessage(id, body) {
      return (await request(`/v1/inbox/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      })) as MessageView;
    },
    async unsendMessage(id) {
      return (await request(`/v1/inbox/messages/${id}`, { method: 'DELETE' })) as MessageView;
    },
    async reactToMessage(id, emoji) {
      return (await post(`/v1/inbox/messages/${id}/reactions`, { emoji })) as MessageView;
    },
    async unreactToMessage(id) {
      return (await request(`/v1/inbox/messages/${id}/reactions`, { method: 'DELETE' })) as MessageView;
    },
    async markConversationRead(id, messageId) {
      await post(`/v1/inbox/conversations/${id}/read`, { messageId });
    },
    async markConversationDelivered(id, messageId) {
      await post(`/v1/inbox/conversations/${id}/delivered`, { messageId });
    },
    async acceptMessageRequest(id) {
      return (await post(`/v1/inbox/requests/${id}/accept`)) as ConversationView;
    },
    async declineMessageRequest(id) {
      await post(`/v1/inbox/requests/${id}/decline`);
    },
    async reportConversation(id, reason, details = '') {
      return (await post(`/v1/inbox/conversations/${id}/report`, { reason, details })) as ReportView;
    },
    async reportMessage(id, reason, details = '') {
      return (await post(`/v1/inbox/messages/${id}/report`, { reason, details })) as ReportView;
    },
    async reportPost(id, reason, details = '') {
      return (await post(`/v1/posts/${id}/report`, { reason, details })) as ReportView;
    },
    async reportComment(id, reason, details = '') {
      return (await post(`/v1/comments/${id}/report`, { reason, details })) as ReportView;
    },
    async reportMoment(id, reason, details = '') {
      return (await post(`/v1/moments/${id}/report`, { reason, details })) as ReportView;
    },
    async reportLoop(id, reason, details = '') {
      return (await post(`/v1/loops/${id}/report`, { reason, details })) as ReportView;
    },
    async reportAccount(handle, reason, details = '') {
      return (await post(`/v1/users/${handle}/report`, { reason, details })) as ReportView;
    },
    async approveComment(id) {
      return (await post(`/v1/comments/${id}/approve`)) as CommentView;
    },
    async setSensitivity(sensitivityLevel) {
      return (await request('/v1/me/sensitivity', {
        method: 'PUT',
        body: JSON.stringify({ sensitivityLevel }),
      })) as MeProfile;
    },
    async requestExport() {
      return (await post('/v1/me/export')) as ExportJobView;
    },
    async listExports() {
      return (await request('/v1/me/export')) as { items: ExportJobView[] };
    },
    async getExport(id) {
      return (await request(`/v1/me/export/${id}`)) as ExportJobView;
    },
    async requestDeletion(password) {
      return (await post('/v1/me/delete', { password })) as DeletionRequestView;
    },
    async cancelDeletion() {
      await request('/v1/me/delete', { method: 'DELETE' });
    },
    async createAppeal(caseId, statement) {
      return (await post('/v1/appeals', { caseId, statement })) as AppealView;
    },
    async listAppeals() {
      return (await request('/v1/me/appeals')) as { items: AppealView[] };
    },
    async getMessagingPrefs() {
      return (await request('/v1/me/messaging')) as MessagingPrefs;
    },
    async setMessagingPrefs(body) {
      return (await request('/v1/me/messaging', {
        method: 'PUT',
        body: JSON.stringify(body),
      })) as MessagingPrefs;
    },
    async inboxPresence(handles) {
      const params = new URLSearchParams({ handles: handles.join(',') });
      return (await request(`/v1/inbox/presence?${params}`)) as {
        items: { handle: string; online: boolean }[];
      };
    },
    async inboxBadge() {
      return (await request('/v1/inbox/badge')) as InboxBadge;
    },
    async listNotifications(opts = {}) {
      const params = new URLSearchParams();
      if (opts.filter) params.set('filter', opts.filter);
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      const q = params.toString();
      return (await request(`/v1/notifications${q ? `?${q}` : ''}`)) as NotificationPage;
    },
    async markNotificationsRead(body) {
      return (await post('/v1/notifications/read', body)) as { read: number };
    },
    async getNotificationPreferences() {
      return (await request('/v1/me/notification-preferences')) as NotificationPreferences;
    },
    async setNotificationPreferences(body) {
      return (await request('/v1/me/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(body),
      })) as NotificationPreferences;
    },
    async listDevices() {
      return (await request('/v1/me/devices')) as { items: DeviceView[] };
    },
    async registerDevice(body) {
      return (await post('/v1/me/devices', body)) as DeviceView;
    },
    async removeDevice(id) {
      await request(`/v1/me/devices/${id}`, { method: 'DELETE' });
    },
    async vapidPublicKey() {
      return (await request('/v1/me/push/vapid')) as { publicKey: string | null; configured: boolean };
    },
  };
}

import { QUICK_EMOJIS, type QuickEmoji } from '@tessera/types';

export const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_MOMENT_VIDEO_DURATION_MS = 30_000;
export const DEFAULT_STILL_DURATION_MS = 5_000;
export const MIN_STILL_DURATION_MS = 1_000;
export const MAX_STILL_DURATION_MS = 15_000;
export const MAX_MOMENT_SEGMENTS = 20;
export const MAX_REEL_SHELVES = 20;
export const MAX_SHELF_ITEMS = 60;
export const INTERACTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const TRAY_BOOST_APPRECIATION_MS = 12 * 60 * 60 * 1000;
export const TRAY_BOOST_COMMENT_MS = 8 * 60 * 60 * 1000;
export const TRAY_BOOST_PRIOR_VIEW_MS = 6 * 60 * 60 * 1000;

export { QUICK_EMOJIS };
export type { QuickEmoji };

export type MomentVisibility = 'public' | 'followers' | 'circles';

export function momentExpiresAt(publishedAt: Date, ttlMs = MOMENT_TTL_MS): Date {
  return new Date(publishedAt.getTime() + ttlMs);
}

export function clampStillDuration(ms: number | undefined | null): number {
  if (ms == null || !Number.isFinite(ms)) return DEFAULT_STILL_DURATION_MS;
  return Math.min(MAX_STILL_DURATION_MS, Math.max(MIN_STILL_DURATION_MS, Math.round(ms)));
}

export function isQuickEmoji(value: string): value is QuickEmoji {
  return (QUICK_EMOJIS as readonly string[]).includes(value);
}

export function muteHidesMoments(scope: 'posts' | 'moments' | 'both' | null | undefined): boolean {
  return scope === 'moments' || scope === 'both';
}

export function canViewMoment(input: {
  authorId: string;
  viewerId?: string;
  visibility: MomentVisibility;
  authorPrivate: boolean;
  viewerFollowsAuthor: boolean;
  blockedEitherWay: boolean;
  published: boolean;
  deleted: boolean;
  expired: boolean;
  /** Kept onto a Reel Shelf the viewer is allowed to open. */
  keptVisible: boolean;
  archiveForAuthor: boolean;
  viewerInAuthorCircle?: boolean;
}): boolean {
  if (input.deleted) return false;
  if (input.blockedEitherWay) return false;
  if (input.viewerId === input.authorId) {
    if (!input.published) return true;
    if (input.expired) return input.keptVisible || input.archiveForAuthor;
    return true;
  }
  if (!input.published) return false;
  if (input.expired) return input.keptVisible;
  if (input.visibility === 'circles') return Boolean(input.viewerInAuthorCircle);
  if (input.authorPrivate && !input.viewerFollowsAuthor) return false;
  if (input.visibility === 'followers') return input.viewerFollowsAuthor;
  return true;
}

export function canKeepMoment(input: {
  now?: Date;
  expiresAt: Date | null;
  expiredAt: Date | null;
  deletedAt: Date | null;
  publishedAt: Date | null;
}): boolean {
  if (!input.publishedAt || input.deletedAt || input.expiredAt) return false;
  const now = input.now ?? new Date();
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export type ExpiryAction = 'keep' | 'archive' | 'delete';

export function expiryAction(input: { kept: boolean; archiveEnabled: boolean }): ExpiryAction {
  if (input.kept) return 'keep';
  if (input.archiveEnabled) return 'archive';
  return 'delete';
}

export function linkStickerAllowed(accountType: 'personal' | 'creator' | 'business'): boolean {
  return accountType === 'creator' || accountType === 'business';
}

export function trayInteractionBoostMs(input: {
  appreciatedRecently: boolean;
  commentedRecently: boolean;
  viewedMomentsRecently: boolean;
}): number {
  let boost = 0;
  if (input.appreciatedRecently) boost += TRAY_BOOST_APPRECIATION_MS;
  if (input.commentedRecently) boost += TRAY_BOOST_COMMENT_MS;
  if (input.viewedMomentsRecently) boost += TRAY_BOOST_PRIOR_VIEW_MS;
  return boost;
}

export type TraySortInput = {
  authorId: string;
  isSelf: boolean;
  unseen: boolean;
  latestAt: number;
  interactionBoostMs: number;
};

export function compareTrayRings(a: TraySortInput, b: TraySortInput): number {
  if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
  if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
  return b.latestAt + b.interactionBoostMs - (a.latestAt + a.interactionBoostMs);
}

export function orderMomentTray<T extends TraySortInput>(rings: T[]): T[] {
  return [...rings].sort(compareTrayRings);
}

import type { AuthorPreview, MediaView, PostVisibility } from './post';

export type MomentVisibility = PostVisibility;

export const MOMENT_STICKER_KINDS = [
  'text',
  'drawing',
  'mention',
  'location',
  'hashtag',
  'poll',
  'question',
  'countdown',
  'link',
] as const;

export type MomentStickerKind = (typeof MOMENT_STICKER_KINDS)[number];

export const QUICK_EMOJIS = ['✨', '😂', '💛', '🎯', '🌿', '🙌'] as const;
export type QuickEmoji = (typeof QUICK_EMOJIS)[number];

export type MomentStickerView = {
  id: string;
  kind: MomentStickerKind;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  payload: Record<string, unknown>;
  /** Poll tallies or question count. Null until the viewer is allowed to see them. */
  summary: Record<string, unknown> | null;
  mine: Record<string, unknown> | null;
};

export type MomentSegmentView = {
  id: string;
  sortOrder: number;
  durationMs: number;
  media: MediaView;
  stickers: MomentStickerView[];
  reaction: { mine: string | null; counts: Record<string, number> | null };
  viewedByMe: boolean;
};

export type MomentCard = {
  id: string;
  author: AuthorPreview;
  visibility: MomentVisibility;
  publishedAt: string | null;
  expiresAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  segments: MomentSegmentView[];
  viewer: { isAuthor: boolean; canKeep: boolean };
  keptOnShelfIds: string[];
  sensitive: boolean;
  takenDown: boolean;
};

export type MomentTrayRing = {
  author: AuthorPreview;
  latestAt: string;
  unseenCount: number;
  segmentCount: number;
  preview: MediaView | null;
  isSelf: boolean;
  momentIds: string[];
};

export type MomentTray = {
  rings: MomentTrayRing[];
};

export type MomentAuthorReel = {
  author: AuthorPreview;
  moments: MomentCard[];
  nextCursor: string | null;
};

export type MomentViewerRow = {
  viewer: AuthorPreview;
  viewedAt: string;
  lastSegmentId: string;
  reaction: string | null;
};

export type ReelShelfCard = {
  id: string;
  title: string;
  sortOrder: number;
  itemCount: number;
  cover: MediaView | null;
  createdAt: string;
};

export type ReelShelfDetail = ReelShelfCard & {
  items: Array<{
    id: string;
    keptAt: string;
    sortOrder: number;
    moment: MomentCard;
  }>;
};

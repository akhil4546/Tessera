import type { AppreciationType } from './appreciation';
import type { AudienceValue } from './audience';

export type CropAspect = 'original' | 'square' | 'portrait' | 'landscape';
export type AuthenticityKind = 'unfiltered' | 'edited' | 'ai_generated';
export type MediaKind = 'image' | 'video' | 'audio';
export type MediaStatus = 'awaiting_upload' | 'uploaded' | 'processing' | 'ready' | 'failed';
export type PostVisibility = 'public' | 'followers' | 'circles';

export type MediaAdjustments = {
  brightness: number;
  contrast: number;
  warmth: number;
  saturation: number;
  fade: number;
  vignette: number;
  sharpen: number;
};

export type PeopleTagView = {
  handle: string;
  displayName: string;
  x: number;
  y: number;
};

export type MediaSrc = {
  width: number;
  webp: string;
  avif: string;
};

export type MediaView = {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  width: number | null;
  height: number | null;
  aspect: number | null;
  blurhash: string | null;
  altText: string;
  durationMs: number | null;
  crop: CropAspect;
  filterId: string;
  adjustments: MediaAdjustments;
  srcset: MediaSrc[];
  posterUrl: string | null;
  hlsUrl: string | null;
  audioUrl: string | null;
  peopleTags: PeopleTagView[];
  processingError: string | null;
};

export type AuthorPreview = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type AppreciationView = {
  mine: AppreciationType | null;
  /** Null when counts are hidden from this viewer. Authors always see counts. */
  counts: Record<AppreciationType, number> | null;
};

export type PostKind = 'post' | 'loop';

export type PostCard = {
  id: string;
  kind: PostKind;
  author: AuthorPreview;
  caption: string;
  hashtags: string[];
  mentions: string[];
  locationName: string | null;
  place: import('./discover').PlacePreview | null;
  authenticity: AuthenticityKind;
  unfiltered: boolean;
  visibility: PostVisibility;
  /** Circle ids the post was shared with. Only populated for the author. */
  circleIds: string[];
  commentsEnabled: boolean;
  publicAppreciationCounts: boolean;
  editedAt: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  media: MediaView[];
  appreciation: AppreciationView;
  commentCount: number;
  viewer: { isAuthor: boolean };
  loop: import('./loop').LoopView | null;
  sensitive: boolean;
  takenDown: boolean;
};

export type FinishLineView = {
  reached: boolean;
  seenSinceLastVisit: number;
  olderAvailable: boolean;
};

export type FollowingFeed = {
  items: PostCard[];
  nextCursor: string | null;
  finishLine: FinishLineView | null;
  keepGoing: boolean;
};

export type MosaicTile = {
  post: PostCard;
  role: 'hero' | 'tile';
  position: number | null;
  span: { cols: 1 | 2; rows: 1 | 2 };
};

export type MosaicView = {
  handle: string;
  tiles: MosaicTile[];
  nextCursor: string | null;
};

export type CommentView = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  author: AuthorPreview;
  pinned: boolean;
  hidden: boolean;
  hiddenByRestrict: boolean;
  deleted: boolean;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  replies: CommentView[];
};

export type MediaIntent = {
  id: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresIn: number;
  maxBytes: number;
  driver: 's3' | 'fs';
  /** When driver is fs, POST the bytes here instead of a presigned S3 URL. */
  localUploadPath: string | null;
};

export type AudienceForPhase2 = AudienceValue;

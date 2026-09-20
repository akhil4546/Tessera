import { parseCaption } from '@tessera/media';
import type {
  AuthorPreview,
  MediaView,
  MomentCard,
  MomentSegmentView,
  MomentStickerView,
  ReelShelfCard,
} from '@tessera/types';
import { toAuthorPreview } from '../posts/posts.mapper.js';

type StickerRow = {
  id: string;
  kind: MomentStickerView['kind'];
  x: number;
  y: number;
  rotation: number;
  scale: number;
  payload: unknown;
  responses: { userId: string; payload: unknown }[];
};

type SegmentRow = {
  id: string;
  sortOrder: number;
  durationMs: number;
  stickers: StickerRow[];
  views: { viewerId: string }[];
  reactions: { userId: string; emoji: string }[];
};

export function stickerPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function toStickerView(
  sticker: StickerRow,
  viewerId: string | undefined,
  isAuthor: boolean,
): MomentStickerView {
  const payload = stickerPayload(sticker.payload);
  const mineRow = viewerId ? sticker.responses.find((row) => row.userId === viewerId) : undefined;
  const mine = mineRow ? stickerPayload(mineRow.payload) : null;
  let summary: Record<string, unknown> | null = null;

  if (sticker.kind === 'poll') {
    const options = Array.isArray(payload.options) ? payload.options.map(String) : [];
    const tallies = options.map((text, index) => ({
      text,
      votes: sticker.responses.filter((row) => stickerPayload(row.payload).optionIndex === index).length,
    }));
    if (isAuthor || mine) {
      summary = { total: sticker.responses.length, options: tallies };
    }
  }
  if (sticker.kind === 'question') {
    summary = isAuthor
      ? {
          count: sticker.responses.length,
          answers: sticker.responses.map((row) => ({
            text: String(stickerPayload(row.payload).text ?? ''),
          })),
        }
      : { count: sticker.responses.length };
  }

  return {
    id: sticker.id,
    kind: sticker.kind,
    x: sticker.x,
    y: sticker.y,
    rotation: sticker.rotation,
    scale: sticker.scale,
    payload,
    summary,
    mine,
  };
}

export function toSegmentView(
  segment: SegmentRow,
  media: MediaView,
  viewerId: string | undefined,
  isAuthor: boolean,
): MomentSegmentView {
  const counts: Record<string, number> = {};
  let mine: string | null = null;
  for (const row of segment.reactions) {
    counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
    if (row.userId === viewerId) mine = row.emoji;
  }
  return {
    id: segment.id,
    sortOrder: segment.sortOrder,
    durationMs: segment.durationMs,
    media,
    stickers: segment.stickers.map((sticker) => toStickerView(sticker, viewerId, isAuthor)),
    reaction: { mine, counts: isAuthor ? counts : null },
    viewedByMe: Boolean(viewerId && segment.views.some((row) => row.viewerId === viewerId)),
  };
}

export function toMomentCard(input: {
  moment: {
    id: string;
    visibility: 'public' | 'followers' | 'circles';
    publishedAt: Date | null;
    expiresAt: Date | null;
    expiredAt: Date | null;
    createdAt: Date;
    sensitive?: boolean;
    takenDownAt?: Date | null;
    author: { id: string; handle: string; profile: { displayName: string } | null };
    shelfItems: { shelfId: string }[];
  };
  authorAvatarUrl: string | null;
  segments: MomentSegmentView[];
  viewerId?: string;
  canKeep: boolean;
}): MomentCard {
  const isAuthor = input.viewerId === input.moment.author.id;
  return {
    id: input.moment.id,
    author: toAuthorPreview({ ...input.moment.author, avatarUrl: input.authorAvatarUrl }),
    visibility: input.moment.visibility,
    publishedAt: input.moment.publishedAt?.toISOString() ?? null,
    expiresAt: input.moment.expiresAt?.toISOString() ?? null,
    expiredAt: input.moment.expiredAt?.toISOString() ?? null,
    createdAt: input.moment.createdAt.toISOString(),
    segments: input.segments,
    viewer: { isAuthor, canKeep: isAuthor && input.canKeep },
    keptOnShelfIds: isAuthor ? input.moment.shelfItems.map((row) => row.shelfId) : [],
    sensitive: Boolean(input.moment.sensitive),
    takenDown: Boolean(input.moment.takenDownAt),
  };
}

export function toShelfCard(
  shelf: { id: string; title: string; sortOrder: number; createdAt: Date; _count?: { items: number } },
  itemCount: number,
  cover: MediaView | null,
): ReelShelfCard {
  return {
    id: shelf.id,
    title: shelf.title,
    sortOrder: shelf.sortOrder,
    itemCount,
    cover,
    createdAt: shelf.createdAt.toISOString(),
  };
}

export function authorPreview(
  user: { id: string; handle: string; profile: { displayName: string } | null },
  avatarUrl: string | null,
): AuthorPreview {
  return toAuthorPreview({ ...user, avatarUrl });
}

export function normalizeHashtag(tag: string): string {
  return parseCaption(`#${tag.replace(/^#/, '')}`).hashtags[0] ?? tag.replace(/^#/, '').toLowerCase();
}

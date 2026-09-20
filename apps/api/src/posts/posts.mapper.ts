import { APPRECIATION_TYPES, type AppreciationType, type AuthorPreview, type PostCard } from '@tessera/types';
import { unfilteredBadge, type MediaEditState } from '@tessera/media';
import type { MediaView } from '@tessera/types';

export function emptyCounts(): Record<AppreciationType, number> {
  return { inspiring: 0, funny: 0, love: 0, useful: 0 };
}

export function toAuthorPreview(user: {
  id: string;
  handle: string;
  profile: { displayName: string } | null;
  avatarUrl?: string | null;
}): AuthorPreview {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.profile?.displayName ?? user.handle,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function toPostCard(input: {
  post: {
    id: string;
    kind?: 'post' | 'loop';
    caption: string;
    locationName: string | null;
    place?: { id: string; slug: string; name: string; lat: number | null; lng: number | null } | null;
    authenticity: 'unfiltered' | 'edited' | 'ai_generated';
    visibility: 'public' | 'followers' | 'circles';
    commentsEnabled: boolean;
    publicAppreciationCounts: boolean;
    editedAt: Date | null;
    publishedAt: Date | null;
    scheduledAt?: Date | null;
    createdAt: Date;
    sensitive?: boolean;
    takenDownAt?: Date | null;
    author: { id: string; handle: string; profile: { displayName: string } | null };
    hashtags: { hashtag: { tag: string } }[];
  };
  media: MediaView[];
  authorAvatarUrl: string | null;
  viewerId?: string;
  mine: AppreciationType | null;
  counts: Record<AppreciationType, number>;
  commentCount: number;
  mentions: string[];
  loop?: import('@tessera/types').LoopView | null;
  circleIds?: string[];
}): PostCard {
  const edits: MediaEditState[] = input.media.map((item) => ({
    filterId: item.filterId,
    adjustments: item.adjustments,
  }));
  const isAuthor = input.viewerId === input.post.author.id;
  const showCounts = isAuthor || input.post.publicAppreciationCounts;
  return {
    id: input.post.id,
    kind: input.post.kind ?? 'post',
    author: toAuthorPreview({ ...input.post.author, avatarUrl: input.authorAvatarUrl }),
    caption: input.post.caption,
    hashtags: input.post.hashtags.map((row) => row.hashtag.tag),
    mentions: input.mentions,
    locationName: input.post.locationName,
    place: input.post.place
      ? {
          id: input.post.place.id,
          slug: input.post.place.slug,
          name: input.post.place.name,
          lat: input.post.place.lat,
          lng: input.post.place.lng,
        }
      : null,
    authenticity: input.post.authenticity,
    unfiltered: unfilteredBadge(input.post.authenticity, edits),
    visibility: input.post.visibility,
    circleIds: input.circleIds ?? [],
    commentsEnabled: input.post.commentsEnabled,
    publicAppreciationCounts: input.post.publicAppreciationCounts,
    editedAt: input.post.editedAt?.toISOString() ?? null,
    publishedAt: input.post.publishedAt?.toISOString() ?? null,
    scheduledAt: input.post.scheduledAt?.toISOString() ?? null,
    createdAt: input.post.createdAt.toISOString(),
    media: input.media,
    appreciation: {
      mine: input.mine,
      counts: showCounts ? input.counts : null,
    },
    commentCount: input.commentCount,
    viewer: { isAuthor },
    loop: input.loop ?? null,
    sensitive: Boolean(input.post.sensitive),
    takenDown: Boolean(input.post.takenDownAt),
  };
}

export function tallyAppreciations(
  rows: { kind: AppreciationType }[],
): Record<AppreciationType, number> {
  const counts = emptyCounts();
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}

export { APPRECIATION_TYPES };

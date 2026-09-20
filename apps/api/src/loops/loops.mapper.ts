import { parseClipRecipes, parseOverlays } from '@tessera/media';
import type { AudioTrackView, AuthorPreview, LoopView } from '@tessera/types';
import { toAuthorPreview } from '../posts/posts.mapper.js';

export function toAudioTrackView(input: {
  id: string;
  title: string;
  durationMs: number;
  allowReuse: boolean;
  useCount: number;
  audioUrl: string | null;
  waveform: unknown;
  sourcePostId: string | null;
  owner: { id: string; handle: string; profile: { displayName: string } | null };
  ownerAvatarUrl: string | null;
}): AudioTrackView {
  const waveform = Array.isArray(input.waveform)
    ? input.waveform.filter((n): n is number => typeof n === 'number')
    : [];
  return {
    id: input.id,
    title: input.title,
    durationMs: input.durationMs,
    allowReuse: input.allowReuse,
    useCount: input.useCount,
    audioUrl: input.audioUrl,
    waveform,
    author: toAuthorPreview({ ...input.owner, avatarUrl: input.ownerAvatarUrl }),
    sourcePostId: input.sourcePostId,
  };
}

export function toLoopView(input: {
  coverFrameMs: number;
  allowAudioReuse: boolean;
  captionStatus: LoopView['captionStatus'];
  captionError: string | null;
  captionsUrl: string | null;
  overlays: unknown;
  clips: unknown;
  audio: AudioTrackView | null;
}): LoopView {
  return {
    coverFrameMs: input.coverFrameMs,
    allowAudioReuse: input.allowAudioReuse,
    captionStatus: input.captionStatus,
    captionError: input.captionError,
    captionsUrl: input.captionsUrl,
    overlays: parseOverlays(input.overlays),
    clips: parseClipRecipes(input.clips),
    audio: input.audio,
  };
}

export function audioAuthor(user: {
  id: string;
  handle: string;
  profile: { displayName: string } | null;
  avatarUrl?: string | null;
}): AuthorPreview {
  return toAuthorPreview(user);
}

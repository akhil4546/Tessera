import type { AuthorPreview, PostCard } from './post';

export type CaptionStatus = 'pending' | 'ready' | 'skipped' | 'failed';

export const LOOP_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
export type LoopSpeed = (typeof LOOP_SPEEDS)[number];

export type LoopOverlay = {
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  startMs: number;
  endMs: number | null;
  color: string;
};

export type LoopClipView = {
  mediaId: string;
  trimStartMs: number;
  trimEndMs: number;
  speed: LoopSpeed;
};

export type AudioTrackView = {
  id: string;
  title: string;
  durationMs: number;
  allowReuse: boolean;
  useCount: number;
  audioUrl: string | null;
  waveform: number[];
  author: AuthorPreview;
  sourcePostId: string | null;
};

export type LoopView = {
  coverFrameMs: number;
  allowAudioReuse: boolean;
  captionStatus: CaptionStatus;
  captionError: string | null;
  captionsUrl: string | null;
  overlays: LoopOverlay[];
  clips: LoopClipView[];
  audio: AudioTrackView | null;
};

export type WellbeingView = {
  loopsBudgetMinutes: number | null;
  watchedSecondsToday: number;
  remainingSeconds: number | null;
  paused: boolean;
  dismissedToday: boolean;
  bonusMinutesToday: number;
  dailyReminderMinutes: number | null;
  sessionNudgeMinutes: number | null;
  appSecondsToday: number;
  sessionSeconds: number;
  dailyReminderReached: boolean;
  sessionNudgeReached: boolean;
};

export type LoopsFeed = {
  items: PostCard[];
  nextCursor: string | null;
  wellbeing: WellbeingView;
};

export const BUDGET_EXTEND_MINUTES = 10;
export const MIN_LOOP_BUDGET_MINUTES = 5;
export const MAX_LOOP_BUDGET_MINUTES = 180;
export const MAX_LOOP_DURATION_MS = 90_000;
export const MAX_LOOP_CLIPS = 10;

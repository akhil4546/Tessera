import type { LoopSpeed } from '@tessera/types';

export const MAX_LOOP_DURATION_MS = 90_000;
export const MAX_LOOP_CLIPS = 10;
export const MAX_LOOP_OVERLAYS = 8;
export const BUDGET_EXTEND_MINUTES = 10;
export const MIN_LOOP_BUDGET_MINUTES = 5;
export const MAX_LOOP_BUDGET_MINUTES = 180;
export const LOOP_SPEEDS: LoopSpeed[] = [0.5, 1, 1.5, 2, 3];
export const ORIGINAL_AUDIO_TITLE = 'Original audio';

export type LoopClipRecipe = {
  mediaId: string;
  trimStartMs: number;
  trimEndMs: number;
  speed: LoopSpeed;
};

export type LoopOverlayRecipe = {
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  startMs: number;
  endMs: number | null;
  color: string;
};

export function isLoopSpeed(value: number): value is LoopSpeed {
  return (LOOP_SPEEDS as number[]).includes(value);
}

export function clipOutputDurationMs(clip: LoopClipRecipe): number {
  const span = Math.max(0, clip.trimEndMs - clip.trimStartMs);
  return Math.round(span / clip.speed);
}

export function composedDurationMs(clips: LoopClipRecipe[]): number {
  return clips.reduce((sum, clip) => sum + clipOutputDurationMs(clip), 0);
}

export function assertLoopDuration(ms: number): { ok: true } | { ok: false; code: string; message: string } {
  if (ms <= 0) {
    return { ok: false, code: 'VIDEO_TOO_SHORT', message: 'A Loop needs at least a moment of video.' };
  }
  if (ms > MAX_LOOP_DURATION_MS) {
    return {
      ok: false,
      code: 'VIDEO_TOO_LONG',
      message: 'Loops can be 90 seconds at most, after trim and speed.',
    };
  }
  return { ok: true };
}

export function audioTitleFromCaption(caption: string): string {
  const trimmed = caption.replace(/\s+/g, ' ').trim();
  if (!trimmed) return ORIGINAL_AUDIO_TITLE;
  return trimmed.length > 40 ? `${trimmed.slice(0, 37).trimEnd()}…` : trimmed;
}

export function utcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function sameUtcDay(value: Date | string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const day = utcDay(new Date(value)).toISOString().slice(0, 10);
  return day === utcDay(now).toISOString().slice(0, 10);
}

export type WellbeingInput = {
  loopsBudgetMinutes: number | null;
  loopsBonusMinutes: number;
  loopsBonusOn: Date | string | null;
  loopsDismissedOn: Date | string | null;
  watchedSecondsToday: number;
  now?: Date;
};

export type WellbeingState = {
  loopsBudgetMinutes: number | null;
  watchedSecondsToday: number;
  remainingSeconds: number | null;
  paused: boolean;
  dismissedToday: boolean;
  bonusMinutesToday: number;
};

export function wellbeingState(input: WellbeingInput): WellbeingState {
  const now = input.now ?? new Date();
  const dismissedToday = sameUtcDay(input.loopsDismissedOn, now);
  const bonusMinutesToday = sameUtcDay(input.loopsBonusOn, now) ? input.loopsBonusMinutes : 0;
  const budget = input.loopsBudgetMinutes;
  if (budget == null) {
    return {
      loopsBudgetMinutes: null,
      watchedSecondsToday: input.watchedSecondsToday,
      remainingSeconds: null,
      paused: false,
      dismissedToday,
      bonusMinutesToday,
    };
  }
  const budgetSeconds = (budget + bonusMinutesToday) * 60;
  const remainingSeconds = Math.max(0, budgetSeconds - input.watchedSecondsToday);
  return {
    loopsBudgetMinutes: budget,
    watchedSecondsToday: input.watchedSecondsToday,
    remainingSeconds,
    paused: remainingSeconds <= 0 && !dismissedToday,
    dismissedToday,
    bonusMinutesToday,
  };
}

export function parseClipRecipes(value: unknown): LoopClipRecipe[] {
  if (!Array.isArray(value)) return [];
  const clips: LoopClipRecipe[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const mediaId = typeof rec.mediaId === 'string' ? rec.mediaId : '';
    const trimStartMs = Number(rec.trimStartMs) || 0;
    const trimEndMs = Number(rec.trimEndMs);
    const speed = Number(rec.speed);
    if (!mediaId || !Number.isFinite(trimEndMs) || !isLoopSpeed(speed)) continue;
    clips.push({ mediaId, trimStartMs, trimEndMs, speed });
  }
  return clips;
}

export function parseOverlays(value: unknown): LoopOverlayRecipe[] {
  if (!Array.isArray(value)) return [];
  const overlays: LoopOverlayRecipe[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.text !== 'string' || !rec.text.trim()) continue;
    overlays.push({
      text: rec.text.trim().slice(0, 80),
      x: clamp01(Number(rec.x)),
      y: clamp01(Number(rec.y)),
      rotation: Number.isFinite(Number(rec.rotation)) ? Number(rec.rotation) : 0,
      scale: Number.isFinite(Number(rec.scale)) ? Number(rec.scale) : 1,
      startMs: Math.max(0, Number(rec.startMs) || 0),
      endMs: rec.endMs == null ? null : Math.max(0, Number(rec.endMs)),
      color: typeof rec.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(rec.color) ? rec.color : '#F4EDE3',
    });
  }
  return overlays.slice(0, MAX_LOOP_OVERLAYS);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

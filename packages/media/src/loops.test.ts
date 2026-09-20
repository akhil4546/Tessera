import { describe, expect, it } from 'vitest';
import { atempoChain } from './ffmpeg.ts';
import {
  assertLoopDuration,
  audioTitleFromCaption,
  composedDurationMs,
  MAX_LOOP_DURATION_MS,
  utcDay,
  wellbeingState,
} from './loops.ts';

describe('loop duration', () => {
  it('applies speed to trim windows and caps at 90s', () => {
    expect(
      composedDurationMs([
        { mediaId: 'a', trimStartMs: 0, trimEndMs: 4000, speed: 2 },
        { mediaId: 'b', trimStartMs: 1000, trimEndMs: 3000, speed: 1 },
      ]),
    ).toBe(4000);
    expect(assertLoopDuration(MAX_LOOP_DURATION_MS).ok).toBe(true);
    expect(assertLoopDuration(MAX_LOOP_DURATION_MS + 1).ok).toBe(false);
  });

  it('builds atempo chains ffmpeg accepts', () => {
    expect(atempoChain(1)).toBe('');
    expect(atempoChain(2)).toBe('atempo=2');
    expect(atempoChain(0.5)).toBe('atempo=0.5');
    expect(atempoChain(3)).toBe('atempo=2,atempo=1.5');
  });
});

describe('original audio titles', () => {
  it('falls back to Original audio and never invents a song name', () => {
    expect(audioTitleFromCaption('')).toBe('Original audio');
    expect(audioTitleFromCaption('  clay dust  ')).toBe('clay dust');
    expect(audioTitleFromCaption('x'.repeat(50)).endsWith('…')).toBe(true);
  });
});

describe('wellbeing budget', () => {
  const day = utcDay(new Date('2026-09-17T15:00:00.000Z'));

  it('does not pause when no budget is set', () => {
    const state = wellbeingState({
      loopsBudgetMinutes: null,
      loopsBonusMinutes: 0,
      loopsBonusOn: null,
      loopsDismissedOn: null,
      watchedSecondsToday: 9_999,
      now: day,
    });
    expect(state.paused).toBe(false);
    expect(state.remainingSeconds).toBeNull();
  });

  it('pauses at the budget and clears after a 10-minute extend or a same-day dismiss', () => {
    const over = wellbeingState({
      loopsBudgetMinutes: 15,
      loopsBonusMinutes: 0,
      loopsBonusOn: null,
      loopsDismissedOn: null,
      watchedSecondsToday: 15 * 60,
      now: day,
    });
    expect(over.paused).toBe(true);
    expect(over.remainingSeconds).toBe(0);

    const extended = wellbeingState({
      loopsBudgetMinutes: 15,
      loopsBonusMinutes: 10,
      loopsBonusOn: day,
      loopsDismissedOn: null,
      watchedSecondsToday: 15 * 60,
      now: day,
    });
    expect(extended.paused).toBe(false);
    expect(extended.remainingSeconds).toBe(600);

    const dismissed = wellbeingState({
      loopsBudgetMinutes: 15,
      loopsBonusMinutes: 0,
      loopsBonusOn: null,
      loopsDismissedOn: day,
      watchedSecondsToday: 20 * 60,
      now: day,
    });
    expect(dismissed.paused).toBe(false);
    expect(dismissed.dismissedToday).toBe(true);
  });

  it('does not carry yesterday’s bonus or dismiss into today', () => {
    const yesterday = new Date('2026-09-16T15:00:00.000Z');
    const state = wellbeingState({
      loopsBudgetMinutes: 10,
      loopsBonusMinutes: 10,
      loopsBonusOn: yesterday,
      loopsDismissedOn: yesterday,
      watchedSecondsToday: 10 * 60,
      now: day,
    });
    expect(state.bonusMinutesToday).toBe(0);
    expect(state.dismissedToday).toBe(false);
    expect(state.paused).toBe(true);
  });
});

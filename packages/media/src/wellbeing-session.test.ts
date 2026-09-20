import { describe, expect, it } from 'vitest';
import { sessionWellbeingState } from './wellbeing-session.ts';

describe('session wellbeing', () => {
  it('reaches the daily reminder when app time crosses the budget', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const state = sessionWellbeingState({
      dailyReminderMinutes: 30,
      sessionNudgeMinutes: null,
      lastBreakNudgeAt: null,
      sessionStartedAt: now,
      appSecondsToday: 30 * 60,
      now,
    });
    expect(state.dailyReminderReached).toBe(true);
    expect(state.sessionNudgeReached).toBe(false);
  });

  it('nudges after a long session once per day', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const started = new Date(now.getTime() - 60 * 60 * 1000);
    const state = sessionWellbeingState({
      dailyReminderMinutes: null,
      sessionNudgeMinutes: 45,
      lastBreakNudgeAt: null,
      sessionStartedAt: started,
      appSecondsToday: 10,
      now,
    });
    expect(state.sessionNudgeReached).toBe(true);
    expect(state.sessionSeconds).toBe(3600);
  });
});

import { sameUtcDay, utcDay } from './loops.ts';

export type SessionWellbeingInput = {
  dailyReminderMinutes: number | null;
  sessionNudgeMinutes: number | null;
  lastBreakNudgeAt: Date | string | null;
  sessionStartedAt: Date | string | null;
  appSecondsToday: number;
  now?: Date;
};

export type SessionWellbeingState = {
  dailyReminderMinutes: number | null;
  sessionNudgeMinutes: number | null;
  appSecondsToday: number;
  sessionSeconds: number;
  dailyReminderReached: boolean;
  sessionNudgeReached: boolean;
};

export function sessionWellbeingState(input: SessionWellbeingInput): SessionWellbeingState {
  const now = input.now ?? new Date();
  const sessionStart = input.sessionStartedAt ? new Date(input.sessionStartedAt) : now;
  const sessionSeconds = Math.max(0, Math.floor((now.getTime() - sessionStart.getTime()) / 1000));
  const dailyReminderReached =
    input.dailyReminderMinutes != null && input.appSecondsToday >= input.dailyReminderMinutes * 60;
  const nudgedToday = sameUtcDay(input.lastBreakNudgeAt, now);
  const sessionNudgeReached =
    input.sessionNudgeMinutes != null &&
    sessionSeconds >= input.sessionNudgeMinutes * 60 &&
    !nudgedToday;
  return {
    dailyReminderMinutes: input.dailyReminderMinutes,
    sessionNudgeMinutes: input.sessionNudgeMinutes,
    appSecondsToday: input.appSecondsToday,
    sessionSeconds,
    dailyReminderReached,
    sessionNudgeReached,
  };
}

export { utcDay };

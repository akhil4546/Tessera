export const DEFAULT_SAVED_BOARD_TITLE = 'Saved';
export const MAX_CIRCLES_PER_USER = 30;
export const MAX_CIRCLE_MEMBERS = 150;
export const MAX_BOARDS_PER_USER = 40;

export type ContentVisibility = 'public' | 'followers' | 'circles';

export function resolveContentAudience(input: {
  visibility?: ContentVisibility;
  audience?: ContentVisibility;
  circleIds?: string[];
}): { visibility: ContentVisibility; circleIds: string[] } {
  const circleIds = [...new Set((input.circleIds ?? []).filter((id) => id.length > 0))];
  const requested = input.audience ?? input.visibility ?? 'public';
  if (requested === 'circles' || circleIds.length > 0) {
    return { visibility: 'circles', circleIds };
  }
  return { visibility: requested, circleIds: [] };
}

export function isScheduledPending(
  post: { scheduledAt: Date | null; publishedAt: Date | null },
  now = new Date(),
): boolean {
  return Boolean(!post.publishedAt && post.scheduledAt && post.scheduledAt.getTime() > now.getTime());
}

export function parseScheduledAt(value: string | null | undefined, now = new Date()): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() <= now.getTime()) return null;
  return date;
}

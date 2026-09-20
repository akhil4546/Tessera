import { describe, expect, it } from 'vitest';
import { isScheduledPending, resolveContentAudience } from './audience.ts';

describe('resolveContentAudience', () => {
  it('treats circleIds as circles even if visibility is public', () => {
    expect(resolveContentAudience({ visibility: 'public', circleIds: ['c1'] })).toEqual({
      visibility: 'circles',
      circleIds: ['c1'],
    });
  });

  it('dedupes circle ids and keeps public/followers otherwise', () => {
    expect(resolveContentAudience({ audience: 'followers' })).toEqual({
      visibility: 'followers',
      circleIds: [],
    });
    expect(resolveContentAudience({ audience: 'circles', circleIds: ['a', 'a', 'b'] }).circleIds).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('isScheduledPending', () => {
  it('holds unpublished posts whose scheduledAt is still in the future', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    expect(
      isScheduledPending(
        { scheduledAt: new Date('2026-09-18T13:00:00.000Z'), publishedAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      isScheduledPending(
        { scheduledAt: new Date('2026-09-18T11:00:00.000Z'), publishedAt: null },
        now,
      ),
    ).toBe(false);
    expect(
      isScheduledPending(
        { scheduledAt: new Date('2026-09-18T13:00:00.000Z'), publishedAt: now },
        now,
      ),
    ).toBe(false);
  });
});

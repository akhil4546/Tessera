import { describe, expect, it } from 'vitest';
import { sliceFollowingFeed } from './finish-line.ts';

const posts = [
  { id: 'n1', publishedAt: new Date('2026-09-17T12:00:00Z') },
  { id: 'n2', publishedAt: new Date('2026-09-16T12:00:00Z') },
  { id: 'o1', publishedAt: new Date('2026-09-10T12:00:00Z') },
];

describe('sliceFollowingFeed', () => {
  it('stops at the finish line until Keep going', () => {
    const caughtUpAt = new Date('2026-09-15T00:00:00Z');
    const first = sliceFollowingFeed({ posts, caughtUpAt, keepGoing: false, limit: 20 });
    expect(first.visible.map((p) => p.id)).toEqual(['n1', 'n2']);
    expect(first.finishLine?.reached).toBe(true);
    expect(first.finishLine?.olderAvailable).toBe(true);
    expect(first.finishLine?.seenSinceLastVisit).toBe(2);

    const older = sliceFollowingFeed({ posts, caughtUpAt, keepGoing: true, limit: 20 });
    expect(older.visible.map((p) => p.id)).toEqual(['o1']);
    expect(older.finishLine).toBeNull();
  });
});

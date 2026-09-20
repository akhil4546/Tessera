import { describe, expect, it } from 'vitest';
import { excludeMinorFromDiscover, minorDiscoverableTo } from './minors.ts';

describe('minor discoverability', () => {
  it('keeps minors out of Discover and public people search', () => {
    expect(excludeMinorFromDiscover(true)).toBe(true);
    expect(
      minorDiscoverableTo({ isMinor: true, viewerFollows: false, isSelf: false, viewerId: 'x' }),
    ).toBe(false);
  });

  it('lets a follower still find a minor they already follow', () => {
    expect(
      minorDiscoverableTo({ isMinor: true, viewerFollows: true, isSelf: false, viewerId: 'x' }),
    ).toBe(true);
  });
});

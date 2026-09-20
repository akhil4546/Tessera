import { describe, expect, it } from 'vitest';
import { ZERO_ADJUSTMENTS } from './adjustments.ts';
import { assertAuthenticity, unfilteredBadge } from './authenticity.ts';

describe('authenticity', () => {
  it('rejects Unfiltered when a filter is applied', () => {
    const result = assertAuthenticity('unfiltered', [{ filterId: 'clay', adjustments: ZERO_ADJUSTMENTS }]);
    expect(result.ok).toBe(false);
  });

  it('allows Unfiltered with no edits', () => {
    const items = [{ filterId: 'none', adjustments: ZERO_ADJUSTMENTS }];
    expect(assertAuthenticity('unfiltered', items).ok).toBe(true);
    expect(unfilteredBadge('unfiltered', items)).toBe(true);
  });
});

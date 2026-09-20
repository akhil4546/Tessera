import { describe, expect, it } from 'vitest';
import { keywordActionPriority, matchKeywordFilters } from './keyword-filter.ts';

describe('keyword filters', () => {
  it('matches case-insensitively and prefers hide over queue', () => {
    const hits = matchKeywordFilters('Buy cheap pills now', [
      { keyword: 'pills', action: 'queue' },
      { keyword: 'cheap pills', action: 'hide' },
    ]);
    expect(hits.map((hit) => hit.keyword)).toEqual(['pills', 'cheap pills']);
    expect(keywordActionPriority(hits)).toBe('hide');
  });

  it('ignores tiny keywords', () => {
    expect(matchKeywordFilters('hi', [{ keyword: 'h', action: 'flag' }])).toEqual([]);
  });
});

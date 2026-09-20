import { describe, expect, it } from 'vitest';
import { FILTER_IDS, FILTER_LIST, FILTERS, FORBIDDEN_FILTER_NAMES } from './filters.ts';

describe('Tessera filters', () => {
  it('defines twelve uniquely named filters', () => {
    expect(FILTER_IDS).toHaveLength(12);
    expect(new Set(FILTER_IDS).size).toBe(12);
    expect(FILTER_LIST).toHaveLength(12);
  });

  it('does not reuse Instagram filter names', () => {
    const names = FILTER_LIST.map((filter) => filter.name.toLowerCase());
    const ids = FILTER_IDS.map((id) => id.toLowerCase());
    for (const forbidden of FORBIDDEN_FILTER_NAMES) {
      expect(names).not.toContain(forbidden);
      expect(ids).not.toContain(forbidden);
    }
  });

  it('gives every filter a CSS preview string', () => {
    for (const id of FILTER_IDS) {
      expect(FILTERS[id].css.length).toBeGreaterThan(5);
    }
  });
});

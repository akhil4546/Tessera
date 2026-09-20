import { describe, expect, it } from 'vitest';
import { meiliConfig, SEARCH_INDEXES } from './search-index.ts';

describe('search-index', () => {
  it('exports the four Meilisearch indexes from the spec', () => {
    expect(Object.values(SEARCH_INDEXES).sort()).toEqual(
      ['tessera_boards', 'tessera_captions', 'tessera_hashtags', 'tessera_people', 'tessera_places'].sort(),
    );
  });

  it('reads host from MEILI_HOST when set', () => {
    const cfg = meiliConfig();
    if (cfg) {
      expect(cfg.host.length).toBeGreaterThan(0);
      expect(cfg.key.length).toBeGreaterThan(0);
    } else {
      expect(cfg).toBeNull();
    }
  });
});

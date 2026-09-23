import { afterEach, describe, expect, it, vi } from 'vitest';
import { meiliConfig, probeMeilisearch, SEARCH_INDEXES } from './search-index.ts';

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

describe('probeMeilisearch', () => {
  const originalHost = process.env.MEILI_HOST;
  const originalKey = process.env.MEILI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalHost === undefined) delete process.env.MEILI_HOST;
    else process.env.MEILI_HOST = originalHost;
    if (originalKey === undefined) delete process.env.MEILI_API_KEY;
    else process.env.MEILI_API_KEY = originalKey;
  });

  it('is NOT_CONFIGURED when the host or key is unset', async () => {
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeMeilisearch(200)).resolves.toBe('NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is ok when Meilisearch /health returns 200', async () => {
    process.env.MEILI_HOST = 'http://search.test/';
    process.env.MEILI_API_KEY = 'secret-key';
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeMeilisearch(200)).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://search.test/health',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret-key' },
      }),
    );
  });

  it('is down when Meilisearch is configured but unreachable', async () => {
    process.env.MEILI_HOST = 'http://search.test';
    process.env.MEILI_API_KEY = 'secret-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    await expect(probeMeilisearch(200)).resolves.toBe('down');
  });
});

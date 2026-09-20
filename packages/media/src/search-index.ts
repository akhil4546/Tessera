/**
 * Meilisearch over HTTP. No SDK — Compose is optional. When the host is down
 * or unset, callers fall back to Postgres (labelled, not faked).
 */

export const SEARCH_INDEXES = {
  people: 'tessera_people',
  hashtags: 'tessera_hashtags',
  places: 'tessera_places',
  captions: 'tessera_captions',
  boards: 'tessera_boards',
} as const;

export type SearchIndexName = (typeof SEARCH_INDEXES)[keyof typeof SEARCH_INDEXES];

export type MeiliHit = { id: string; [key: string]: unknown };

type MeiliConfig = { host: string; key: string };

export function meiliConfig(): MeiliConfig | null {
  const host = process.env.MEILI_HOST?.replace(/\/$/, '');
  const key = process.env.MEILI_API_KEY;
  if (!host || !key) return null;
  return { host, key };
}

async function meiliFetch(cfg: MeiliConfig, path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(`${cfg.host}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    return null;
  }
}

export async function meiliAvailable(): Promise<boolean> {
  const cfg = meiliConfig();
  if (!cfg) return false;
  const res = await meiliFetch(cfg, '/health');
  return Boolean(res?.ok);
}

export async function ensureSearchIndexes(): Promise<boolean> {
  const cfg = meiliConfig();
  if (!cfg) return false;
  const health = await meiliFetch(cfg, '/health');
  if (!health?.ok) return false;

  const specs: Array<{ uid: SearchIndexName; searchable: string[] }> = [
    { uid: SEARCH_INDEXES.people, searchable: ['handle', 'displayName', 'bio'] },
    { uid: SEARCH_INDEXES.hashtags, searchable: ['tag'] },
    { uid: SEARCH_INDEXES.places, searchable: ['name', 'slug'] },
    { uid: SEARCH_INDEXES.captions, searchable: ['caption', 'handle', 'hashtags'] },
    { uid: SEARCH_INDEXES.boards, searchable: ['title', 'description', 'handle'] },
  ];

  for (const spec of specs) {
    await meiliFetch(cfg, '/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: spec.uid, primaryKey: 'id' }),
    });
    const settings = await meiliFetch(cfg, `/indexes/${spec.uid}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        searchableAttributes: spec.searchable,
        typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
      }),
    });
    if (!settings?.ok) return false;
  }
  return true;
}

export async function meiliIndexDocuments(
  index: SearchIndexName,
  documents: Array<Record<string, unknown>>,
): Promise<boolean> {
  if (documents.length === 0) return true;
  const cfg = meiliConfig();
  if (!cfg) return false;
  const res = await meiliFetch(cfg, `/indexes/${index}/documents`, {
    method: 'PUT',
    body: JSON.stringify(documents),
  });
  return Boolean(res?.ok);
}

export async function meiliDeleteDocument(index: SearchIndexName, id: string): Promise<void> {
  const cfg = meiliConfig();
  if (!cfg) return;
  await meiliFetch(cfg, `/indexes/${index}/documents/${id}`, { method: 'DELETE' });
}

export async function meiliSearch(
  index: SearchIndexName,
  q: string,
  limit: number,
): Promise<MeiliHit[] | null> {
  const cfg = meiliConfig();
  if (!cfg) return null;
  const res = await meiliFetch(cfg, `/indexes/${index}/search`, {
    method: 'POST',
    body: JSON.stringify({ q, limit }),
  });
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { hits?: MeiliHit[] } | null;
  return body?.hits ?? [];
}

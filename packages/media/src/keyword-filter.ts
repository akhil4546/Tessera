import type { KeywordFilterAction } from '@tessera/types';

export type KeywordHit = {
  keyword: string;
  action: KeywordFilterAction;
};

export function matchKeywordFilters(
  text: string,
  filters: { keyword: string; action: KeywordFilterAction }[],
): KeywordHit[] {
  const hay = text.toLowerCase();
  const hits: KeywordHit[] = [];
  for (const filter of filters) {
    const keyword = filter.keyword.trim().toLowerCase();
    if (keyword.length < 2) continue;
    if (hay.includes(keyword)) hits.push({ keyword, action: filter.action });
  }
  return hits;
}

export function keywordActionPriority(hits: KeywordHit[]): KeywordFilterAction | null {
  if (hits.some((hit) => hit.action === 'hide')) return 'hide';
  if (hits.some((hit) => hit.action === 'queue')) return 'queue';
  if (hits.length > 0) return 'flag';
  return null;
}

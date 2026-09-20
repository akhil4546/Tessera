'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import type { DiscoverItem, RankingSignal } from '@tessera/types';
import { Button, EmptyState, Skeleton, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { mediaSrc } from '../lib/media';
import { WhySheet } from './why-sheet';

export function DiscoverGrid() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState<string | null>(null);
  const [why, setWhy] = useState<{ signals: RankingSignal[]; score: number } | null>(null);
  const [query, setQuery] = useState('');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch (err) {
        if (err instanceof TesseraApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  const feed = useQuery({
    queryKey: ['feed', 'discover', topic],
    queryFn: () => api.discoverFeed({ topic: topic ?? undefined }),
    enabled: Boolean(me.data),
  });

  const suggestions = useQuery({
    queryKey: ['discover', 'people'],
    queryFn: () => api.suggestedPeople(),
    enabled: Boolean(me.data),
  });

  const search = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: Boolean(me.data) && query.trim().length >= 2,
  });

  const recent = useQuery({
    queryKey: ['search', 'recent'],
    queryFn: () => api.recentSearches(),
    enabled: Boolean(me.data) && query.trim().length < 2,
  });

  const dismiss = useMutation({
    mutationFn: (handle: string) => api.dismissSuggestedPerson(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discover', 'people'] }),
  });

  if (me.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!me.data) {
    return <EmptyState title={t('empty.discover.title')} body={t('empty.discover.body')} />;
  }

  const items: DiscoverItem[] = feed.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{t('discover.search')}</span>
          <input
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
            placeholder={t('discover.search')}
          />
        </label>
        <Link className="min-h-11 text-sm font-medium text-accent underline" href="/discover/tune">
          {t('discover.tune')}
        </Link>
      </div>

      {search.data?.engine === 'postgres' ? (
        <p className="text-sm text-text-secondary">{t('discover.enginePostgres')}</p>
      ) : null}

      {search.data ? (
        <SearchHits results={search.data} />
      ) : recent.data?.items.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-secondary">{t('discover.recent')}</span>
          {recent.data.items.map((row) => (
            <button
              key={row.query}
              type="button"
              className="min-h-11 rounded-tile bg-surface-muted px-3"
              onClick={() => setQuery(row.query)}
            >
              {row.query}
            </button>
          ))}
          <button
            type="button"
            className="min-h-11 text-accent underline"
            onClick={() => {
              void api.clearRecentSearches().then(() => queryClient.invalidateQueries({ queryKey: ['search', 'recent'] }));
            }}
          >
            {t('discover.clearRecent')}
          </button>
        </div>
      ) : null}

      {feed.data?.topics.length ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`min-h-11 rounded-tile px-3 text-sm ${topic == null ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
            onClick={() => setTopic(null)}
          >
            {t('discover.topics')}
          </button>
          {feed.data.topics.map((chip) => (
            <button
              key={chip.tag}
              type="button"
              className={`min-h-11 rounded-tile px-3 text-sm ${topic === chip.tag ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
              onClick={() => setTopic(chip.tag === topic ? null : chip.tag)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.data?.items.length ? (
        <Tile>
          <h2 className="font-display text-xl font-semibold">{t('discover.suggested')}</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {suggestions.data.items.map((row) => (
              <li key={row.profile.id} className="flex items-center justify-between gap-3">
                <div>
                  <Link className="font-medium text-accent underline" href={`/u/${row.profile.handle}`}>
                    {row.profile.displayName}
                  </Link>
                  <p className="text-sm text-text-secondary">{row.reason}</p>
                </div>
                <Button variant="ghost" onClick={() => dismiss.mutate(row.profile.handle)}>
                  {t('discover.dismiss')}
                </Button>
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}

      {feed.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="aspect-[4/5] w-full" />
          <Skeleton className="aspect-[4/5] w-full" />
          <Skeleton className="aspect-[4/5] w-full" />
        </div>
      ) : null}

      {items.length === 0 && !feed.isLoading ? (
        <EmptyState title={t('empty.discover.title')} body={t('empty.discover.body')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => {
            const src = mediaSrc(item.post.media[0]?.srcset.at(-1)?.webp);
            return (
              <article key={item.impressionId} className="overflow-hidden rounded-tile bg-surface-elevated">
                <Link href={item.post.kind === 'loop' ? `/loops/${item.post.id}` : `/p/${item.post.id}`}>
                  {src ? (
                    <img src={src} alt={item.post.media[0]?.altText ?? ''} className="aspect-[4/5] w-full object-cover" />
                  ) : (
                    <div className="aspect-[4/5] bg-surface-muted" />
                  )}
                </Link>
                <div className="flex items-start justify-between gap-2 p-3">
                  <Link className="text-sm font-medium text-text-primary" href={`/u/${item.post.author.handle}`}>
                    @{item.post.author.handle}
                  </Link>
                  <button
                    type="button"
                    className="text-left text-xs text-accent underline"
                    onClick={() => setWhy({ signals: item.signals, score: item.score })}
                  >
                    {t('discover.why')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {why ? <WhySheet signals={why.signals} score={why.score} onClose={() => setWhy(null)} /> : null}
    </div>
  );
}

function SearchHits({ results }: { results: Awaited<ReturnType<typeof api.search>> }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      {results.people.length ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate">{t('discover.people')}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {results.people.map((person) => (
              <li key={person.id}>
                <Link className="text-accent underline" href={`/u/${person.handle}`}>
                  {person.displayName} @{person.handle}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.hashtags.length ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate">{t('discover.hashtags')}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {results.hashtags.map((row) => (
              <li key={row.tag}>
                <Link className="rounded-tile bg-surface-muted px-3 py-2 text-sm" href={`/h/${row.tag}`}>
                  #{row.tag}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.places.length ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate">{t('discover.places')}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {results.places.map((place) => (
              <li key={place.id}>
                <Link className="text-accent underline" href={`/places/${place.slug}`}>
                  {place.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.captions.length ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate">{t('discover.captions')}</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {results.captions.map((row) => (
              <li key={row.post.id}>
                <Link className="text-accent underline" href={`/p/${row.post.id}`}>
                  {row.post.caption || row.post.id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.boards.length ? (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate">{t('discover.boards')}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {results.boards.map((board) => (
              <li key={board.id}>
                <Link className="text-accent underline" href={`/boards/${board.id}`}>
                  {board.title}
                </Link>
                <span className="text-sm text-text-secondary"> · @{board.owner.handle}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

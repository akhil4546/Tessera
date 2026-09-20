'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';
import { PostCard } from '../../../components/post-card';

function project(lat: number, lng: number) {
  return { x: ((lng + 180) / 360) * 640, y: ((90 - lat) / 180) * 240 };
}

export default function PlacePage() {
  const slug = useParams<{ slug: string }>().slug;
  const t = useTranslations();
  const [sort, setSort] = useState<'top' | 'recent'>('top');
  const page = useQuery({
    queryKey: ['place', slug, sort],
    queryFn: () => api.placePage(slug, { sort }),
  });

  if (page.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (!page.data) return <EmptyState title={t('discover.places')} body={t('empty.discover.body')} />;

  const pin =
    page.data.lat != null && page.data.lng != null ? project(page.data.lat, page.data.lng) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{page.data.name}</h1>
        <p className="text-sm text-text-secondary">{page.data.postCount} public posts</p>
      </div>
      {pin ? (
        <Tile>
          <svg viewBox="0 0 640 240" className="w-full rounded-tile bg-surface-muted" aria-label={page.data.name}>
            <rect width="640" height="240" fill="#E8DFD2" />
            <circle cx={pin.x} cy={pin.y} r="8" fill="#C8553D" />
          </svg>
        </Tile>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-tile px-3 text-sm ${sort === 'top' ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
          onClick={() => setSort('top')}
        >
          {t('discover.top')}
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-tile px-3 text-sm ${sort === 'recent' ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
          onClick={() => setSort('recent')}
        >
          {t('discover.recentSort')}
        </button>
      </div>
      {page.data.items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

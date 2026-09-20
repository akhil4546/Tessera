'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { mediaSrc } from '../lib/media';

function project(lat: number, lng: number, width: number, height: number) {
  return {
    x: ((lng + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
}

export function MemoryMap({ handle }: { handle: string }) {
  const t = useTranslations();
  const map = useQuery({
    queryKey: ['memory-map', handle],
    queryFn: () => api.memoryMap(handle),
  });

  if (map.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (!map.data) return null;
  if (!map.data.visible) {
    return <EmptyState title={t('discover.map')} body={t('discover.mapHidden')} />;
  }
  if (map.data.pins.length === 0) {
    return <EmptyState title={t('discover.map')} body={t('discover.mapEmpty')} />;
  }

  const width = 640;
  const height = 320;

  return (
    <Tile>
      <h2 className="font-display text-xl font-semibold text-text-primary">{t('discover.map')}</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 w-full rounded-tile bg-surface-muted"
        role="img"
        aria-label={t('discover.map')}
      >
        <rect width={width} height={height} fill="var(--tessera-surface-muted, #E8DFD2)" />
        {map.data.pins.map((pin) => {
          if (pin.place.lat == null || pin.place.lng == null) return null;
          const { x, y } = project(pin.place.lat, pin.place.lng, width, height);
          return (
            <a key={pin.postId} href={`/p/${pin.postId}`}>
              <circle cx={x} cy={y} r="7" fill="#C8553D" stroke="#1F1B16" strokeWidth="1.5" />
              <title>{pin.place.name}</title>
            </a>
          );
        })}
      </svg>
      <ul className="mt-4 flex flex-col gap-2">
        {map.data.pins.map((pin) => (
          <li key={pin.postId} className="flex items-center gap-3 text-sm">
            {pin.thumbnailUrl ? (
              <img src={mediaSrc(pin.thumbnailUrl)} alt="" className="size-10 rounded-tile object-cover" />
            ) : null}
            <div>
              <Link className="font-medium text-accent underline" href={`/places/${pin.place.slug}`}>
                {pin.place.name}
              </Link>
              {pin.caption ? <p className="text-text-secondary">{pin.caption}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

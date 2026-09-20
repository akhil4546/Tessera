'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { mediaSrc } from '../lib/media';
import { MomentViewer } from './moment-viewer';

export function ReelShelves({ handle, isSelf }: { handle: string; isSelf?: boolean }) {
  const t = useTranslations();
  const [openId, setOpenId] = useState<string | null>(null);
  const shelves = useQuery({
    queryKey: ['shelves', handle],
    queryFn: () => api.listReelShelves(handle),
  });

  if (!shelves.data?.items.length) {
    if (!isSelf) return null;
    return <EmptyState title={t('empty.shelves.title')} body={t('empty.shelves.body')} />;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{t('shelf.title')}</h2>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {shelves.data.items.map((shelf) => {
          const src = mediaSrc(shelf.cover?.srcset.at(-1)?.webp);
          return (
            <li key={shelf.id}>
              <button type="button" onClick={() => setOpenId(shelf.id)} className="w-28 text-left">
                <Tile className="p-2">
                  <span className="block aspect-[4/5] overflow-hidden rounded-[10px] bg-surface-muted">
                    {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium">{shelf.title}</span>
                  <span className="text-xs text-text-secondary">{shelf.itemCount}</span>
                </Tile>
              </button>
            </li>
          );
        })}
      </ul>
      {openId ? <MomentViewer handle={handle} shelfId={openId} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

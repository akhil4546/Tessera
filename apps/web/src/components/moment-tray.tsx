'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import type { MomentTrayRing } from '@tessera/types';
import { Skeleton } from '@tessera/ui';
import { api } from '../lib/api';
import { mediaSrc } from '../lib/media';
import { MomentViewer } from './moment-viewer';

export function MomentTray() {
  const t = useTranslations();
  const [openHandle, setOpenHandle] = useState<string | null>(null);
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
  const tray = useQuery({
    queryKey: ['moments', 'tray'],
    queryFn: () => api.momentTray(),
    enabled: Boolean(me.data),
  });

  if (!me.data) return null;
  if (tray.isLoading) return <Skeleton className="h-24 w-full" />;

  const rings = tray.data?.rings ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">{t('feed.moments')}</p>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {rings.length === 0 ? (
          <li>
            <a
              href="/create"
              className="flex min-h-11 min-w-[4.5rem] flex-col items-center gap-1 rounded-tile border border-dashed border-border px-2 py-2 text-center text-xs text-text-secondary"
            >
              {t('feed.addMoment')}
            </a>
          </li>
        ) : null}
        {rings.map((ring) => (
          <li key={ring.author.id}>
            <RingButton ring={ring} onOpen={() => setOpenHandle(ring.author.handle)} />
          </li>
        ))}
      </ul>
      {openHandle ? (
        <MomentViewer
          handle={openHandle}
          neighbours={rings.map((ring) => ring.author.handle)}
          onClose={() => setOpenHandle(null)}
          onSwitch={setOpenHandle}
        />
      ) : null}
    </div>
  );
}

function RingButton({ ring, onOpen }: { ring: MomentTrayRing; onOpen: () => void }) {
  const t = useTranslations();
  const src = mediaSrc(ring.preview?.srcset.at(-1)?.webp ?? ring.author.avatarUrl);
  const unseen = ring.unseenCount > 0 && !ring.isSelf;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-tile border-2 p-1 ${
        unseen ? 'border-accent' : ring.isSelf ? 'border-text-primary' : 'border-border'
      }`}
    >
      <span className="block size-16 overflow-hidden rounded-[10px] bg-surface-muted">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
      </span>
      <span className="max-w-[4.5rem] truncate text-xs text-text-primary">
        {ring.isSelf ? t('feed.yourMoment') : ring.author.handle}
      </span>
    </button>
  );
}

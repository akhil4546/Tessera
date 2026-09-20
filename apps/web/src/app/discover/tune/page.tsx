'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

const SLIDERS = [
  { key: 'peopleIInteractWith', labelKey: 'discover.interact' },
  { key: 'newCreators', labelKey: 'discover.newCreators' },
  { key: 'nearby', labelKey: 'discover.nearby' },
  { key: 'lessVideo', labelKey: 'discover.lessVideo' },
] as const;

export default function TuneDiscoverPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const weights = useQuery({ queryKey: ['discover', 'tuning'], queryFn: () => api.getDiscoverTuning() });
  const [draft, setDraft] = useState({
    peopleIInteractWith: 0.5,
    newCreators: 0.5,
    nearby: 0.5,
    lessVideo: 0,
  });

  useEffect(() => {
    if (weights.data) setDraft(weights.data);
  }, [weights.data]);

  const save = useMutation({
    mutationFn: () => api.setDiscoverTuning(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['discover'] });
      await queryClient.invalidateQueries({ queryKey: ['feed', 'discover'] });
    },
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{t('discover.tuneTitle')}</p>
      <Tile>
        <h1 className="font-display text-3xl font-semibold text-text-primary">{t('discover.tuneTitle')}</h1>
        <p className="mt-3 text-text-secondary">{t('discover.tuneBody')}</p>
        <form
          className="mt-6 flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {SLIDERS.map((slider) => (
            <label key={slider.key} className="flex flex-col gap-2 text-sm">
              <span className="flex justify-between font-medium">
                <span>{t(slider.labelKey)}</span>
                <span>{draft[slider.key].toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft[slider.key]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [slider.key]: Number(event.target.value) }))
                }
                className="min-h-11 accent-[var(--tessera-accent)]"
              />
            </label>
          ))}
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Tile>
      <Link className="text-sm text-accent underline" href="/discover">
        {t('nav.discover')}
      </Link>
    </div>
  );
}

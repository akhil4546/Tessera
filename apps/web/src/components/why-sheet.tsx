'use client';

import { type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { RankingSignal } from '@tessera/types';
import { Tile } from '@tessera/ui';

export function WhySheet({
  signals,
  score,
  onClose,
}: {
  signals: RankingSignal[];
  score: number;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[var(--tessera-overlay)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-title"
      onClick={onClose}
    >
      <Tile
        className="max-h-[80vh] w-full max-w-lg overflow-auto"
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="why-title" className="font-display text-2xl font-semibold text-text-primary">
              {t('discover.whyTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">Score {score.toFixed(2)}</p>
          </div>
          <button type="button" className="min-h-11 px-3 text-sm text-accent underline" onClick={onClose}>
            {t('moment.close')}
          </button>
        </div>
        {signals.length === 0 ? (
          <p className="mt-4 text-text-secondary">{t('discover.whyEmpty')}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {signals.map((signal) => (
              <li key={`${signal.key}-${signal.label}`} className="rounded-tile border border-border p-3">
                <p className="font-medium text-text-primary">{signal.label}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {signal.key} · weight {signal.weight.toFixed(2)} · value {signal.value.toFixed(2)} ·{' '}
                  {t('discover.contribution')} {signal.contribution.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}

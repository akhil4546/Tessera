'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@tessera/ui';
import type { PostVisibility } from '@tessera/types';
import { api } from '../lib/api';

export function AudienceFields({
  visibility,
  onVisibility,
  circleIds,
  onCircleIds,
  scheduledAt,
  onScheduledAt,
}: {
  visibility: PostVisibility;
  onVisibility: (value: PostVisibility) => void;
  circleIds: string[];
  onCircleIds: (ids: string[]) => void;
  scheduledAt?: string;
  onScheduledAt?: (value: string) => void;
}) {
  const t = useTranslations();
  const circles = useQuery({
    queryKey: ['circles'],
    queryFn: () => api.listCircles(),
  });

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">{t('create.audience')}</legend>
        {(['public', 'followers', 'circles'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={visibility === value ? 'primary' : 'secondary'}
            onClick={() => onVisibility(value)}
          >
            {value === 'public' ? t('create.public') : value === 'followers' ? t('create.followers') : t('create.circles')}
          </Button>
        ))}
      </fieldset>
      {visibility === 'circles' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{t('create.circlesHint')}</p>
          <div className="flex flex-wrap gap-2">
            {(circles.data?.items ?? []).map((circle) => {
              const on = circleIds.includes(circle.id);
              return (
                <button
                  key={circle.id}
                  type="button"
                  className={`min-h-11 rounded-tile px-3 text-sm ${on ? 'bg-accent text-text-inverse' : 'bg-surface-muted'}`}
                  onClick={() =>
                    onCircleIds(on ? circleIds.filter((id) => id !== circle.id) : [...circleIds, circle.id])
                  }
                >
                  {circle.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {onScheduledAt ? (
        <label className="flex min-h-11 flex-col gap-1 text-sm">
          <span className="font-medium">{t('create.schedule')}</span>
          <span className="text-text-secondary">{t('create.scheduleHint')}</span>
          <input
            type="datetime-local"
            className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
            value={scheduledAt ?? ''}
            onChange={(e) => onScheduledAt(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

export function toScheduledIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

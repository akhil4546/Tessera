'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Button, Tile } from '@tessera/ui';
import { api } from '../lib/api';

export function SessionWellbeing() {
  const t = useTranslations();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const [nudge, setNudge] = useState<'break' | 'daily' | null>(null);

  useEffect(() => {
    if (!me.data) return;
    const timer = window.setInterval(() => {
      void api
        .wellbeingHeartbeat(15)
        .then((state) => {
          if (state.sessionNudgeReached) setNudge('break');
          else if (state.dailyReminderReached) setNudge('daily');
        })
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [me.data]);

  if (!nudge) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-lg px-4 md:bottom-6">
      <Tile>
        <p className="font-display text-lg font-semibold">
          {nudge === 'break' ? t('settings.breakTitle') : t('settings.dailyTitle')}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {nudge === 'break' ? t('settings.breakBody') : t('settings.dailyBody')}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            onClick={() => {
              if (nudge === 'break') void api.dismissBreakNudge();
              setNudge(null);
            }}
          >
            {t('settings.continueSession')}
          </Button>
        </div>
      </Tile>
    </div>
  );
}

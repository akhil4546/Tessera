'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@tessera/ui';
import { api } from '../lib/api';

export function SensitiveGate({
  sensitive,
  isAuthor,
  children,
}: {
  sensitive: boolean;
  isAuthor?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const [shown, setShown] = useState(false);
  const level = me.data?.sensitivityLevel ?? 'warn';
  if (!sensitive || isAuthor || level === 'show' || shown) return <>{children}</>;
  if (level === 'hide') return null;
  return (
    <div className="relative overflow-hidden rounded-tile">
      <div className="pointer-events-none blur-xl brightness-75">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/40 p-4 text-center">
        <p className="font-medium text-sand">{t('settings.sensitiveLabel')}</p>
        <Button type="button" onClick={() => setShown(true)}>
          {t('settings.showAnyway')}
        </Button>
      </div>
    </div>
  );
}

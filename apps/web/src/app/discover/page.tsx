'use client';

import { useTranslations } from 'next-intl';
import { DiscoverGrid } from '../../components/discover-grid';

export default function DiscoverPage() {
  const t = useTranslations();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('nav.discover')}
      </p>
      <DiscoverGrid />
    </div>
  );
}

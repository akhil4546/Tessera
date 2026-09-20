'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Button } from '@tessera/ui';
import { InboxFilters, InboxList } from '../../components/inbox-list';
import { INBOX_FILTERS, type InboxFilter } from '@tessera/types';

function parseFilter(value: string | null): InboxFilter {
  if (value && (INBOX_FILTERS as readonly string[]).includes(value)) return value as InboxFilter;
  return 'all';
}

function InboxBody() {
  const t = useTranslations();
  const params = useSearchParams();
  const filter = parseFilter(params.get('filter'));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('nav.inbox')}
      </p>
      <h1 className="font-display text-3xl font-semibold">{t('inbox.title')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InboxFilters value={filter} />
        {filter === 'messages' || filter === 'all' || filter === 'requests' ? (
          <Button asChild>
            <Link href="/inbox/new">{t('inbox.newThread')}</Link>
          </Button>
        ) : null}
      </div>
      <InboxList filter={filter} />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxBody />
    </Suspense>
  );
}

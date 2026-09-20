'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { EmptyState, Tile } from '@tessera/ui';
import { api } from '../../lib/api';

export default function DraftsPage() {
  const t = useTranslations();
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: async () => {
      try {
        return await api.listDrafts();
      } catch (err) {
        if (err instanceof TesseraApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
  const scheduled = useQuery({
    queryKey: ['scheduled'],
    queryFn: () => api.listScheduled(),
    enabled: Boolean(drafts.data),
  });

  if (drafts.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (!drafts.data) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('settings.drafts')}
      </p>
      <h1 className="font-display text-3xl font-semibold">{t('settings.drafts')}</h1>
      {!drafts.data.items.length ? (
        <EmptyState title={t('empty.drafts.title')} body={t('empty.drafts.body')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.data.items.map((draft) => (
            <li key={draft.id}>
              <Tile>
                <p className="font-medium">{draft.kind}</p>
                <p className="text-sm text-text-secondary">{new Date(draft.updatedAt).toLocaleString()}</p>
                <p className="mt-2 text-sm">{String((draft.payload as { caption?: string }).caption ?? '')}</p>
              </Tile>
            </li>
          ))}
        </ul>
      )}
      {scheduled.data?.items.length ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">{t('settings.scheduled')}</h2>
          {scheduled.data.items.map((post) => (
            <Tile key={post.id}>
              <p className="font-medium">{post.caption || post.id}</p>
              <p className="text-sm text-text-secondary">
                {t('create.scheduled')} {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : ''}
              </p>
            </Tile>
          ))}
        </div>
      ) : null}
    </div>
  );
}

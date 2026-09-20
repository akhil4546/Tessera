'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, EmptyState } from '@tessera/ui';
import { ProfileCard } from '../../components/profile-card';
import { api } from '../../lib/api';

export default function MePage() {
  const t = useTranslations();
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

  if (me.isLoading) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  if (!me.data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
          {t('common.phase')} · {t('nav.me')}
        </p>
        <EmptyState
          title={t('empty.me.title')}
          body={t('empty.me.body')}
          action={
            <Button asChild>
              <Link href="/login">{t('nav.signIn')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · @{me.data.handle}
      </p>
      {!me.data.emailVerified ? (
        <p className="rounded-tile border border-border bg-accent-muted px-4 py-3 text-sm text-text-primary">
          {t('profile.unverified')}{' '}
          <Link className="underline" href="/verify-email">
            {t('auth.verifyTitle')}
          </Link>
        </p>
      ) : null}
      {me.data.isMinor ? (
        <p className="text-sm text-text-secondary">{t('profile.minor')}</p>
      ) : null}
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/boards">
          {t('settings.boards')}
        </Link>
        <Link className="underline" href="/settings/circles">
          {t('settings.circles')}
        </Link>
      </nav>
      <ProfileCard profile={me.data} isSelf />
    </div>
  );
}

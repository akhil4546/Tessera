'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function RequestsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['follow-requests'], queryFn: () => api.listFollowRequests() });
  const accept = useMutation({
    mutationFn: (handle: string) => api.acceptFollow(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
  });
  const decline = useMutation({
    mutationFn: (handle: string) => api.declineFollow(handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] }),
  });

  const items = requests.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        <Link href="/settings">{t('settings.title')}</Link> · {t('profile.requests')}
      </p>
      {items.length === 0 ? (
        <EmptyState title={t('profile.requests')} body="No pending requests." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((person) => (
            <li key={person.id}>
              <Tile className="flex items-center justify-between gap-3">
                <Link href={`/u/${person.handle}`} className="font-medium">
                  {person.displayName}{' '}
                  <span className="text-text-secondary">@{person.handle}</span>
                </Link>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => accept.mutate(person.handle)}>
                    {t('profile.accept')}
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => decline.mutate(person.handle)}>
                    {t('profile.decline')}
                  </Button>
                </div>
              </Tile>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

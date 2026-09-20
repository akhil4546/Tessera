'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function SessionsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.listSessions() });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        <Link href="/settings">{t('settings.title')}</Link> · {t('settings.sessions')}
      </p>
      <div className="flex justify-end">
        <Button variant="secondary" type="button" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
          {t('settings.revokeOthers')}
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {(sessions.data ?? []).map((session) => (
          <li key={session.id}>
            <Tile className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-text-primary">
                  {session.userAgent ?? 'Unknown device'}
                  {session.current ? ` · ${t('settings.thisDevice')}` : ''}
                </p>
                <p className="text-sm text-text-secondary">
                  {session.ip ?? 'IP hidden'} · {t('settings.lastUsed')} {new Date(session.lastUsedAt).toLocaleString()}
                </p>
              </div>
              {!session.current ? (
                <Button variant="ghost" type="button" onClick={() => revoke.mutate(session.id)}>
                  {t('settings.revoke')}
                </Button>
              ) : null}
            </Tile>
          </li>
        ))}
      </ul>
    </div>
  );
}

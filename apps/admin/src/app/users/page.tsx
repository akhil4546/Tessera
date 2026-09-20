'use client';

import { type FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { Button, TextField, Tile } from '@tessera/ui';
import { adminApi } from '../../lib/api';

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [reason, setReason] = useState('Policy');
  const search = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () =>
      adminApi.users(q) as Promise<{
        items: Array<{ id: string; handle: string; email: string; displayName: string; suspendedAt: string | null }>;
      }>,
    enabled: q.length > 0,
  });
  const detail = useQuery({
    queryKey: ['admin-user', active],
    queryFn: () => adminApi.getUser(active!) as Promise<{
      id: string;
      handle: string;
      email: string;
      displayName: string;
      isMinor: boolean;
      suspendedAt: string | null;
      counts: { followers: number; posts: number; reports: number };
    }>,
    enabled: Boolean(active),
  });
  const suspend = useMutation({
    mutationFn: () => adminApi.suspend(active!, reason, 7),
    onSuccess: () => detail.refetch(),
  });
  const unsuspend = useMutation({
    mutationFn: () => adminApi.unsuspend(active!),
    onSuccess: () => detail.refetch(),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void search.refetch();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.users}</p>
      <Tile>
        <form className="flex gap-2" onSubmit={onSubmit}>
          <TextField name="q" label={en.admin.lookup} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit">Search</Button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {(search.data?.items ?? []).map((row) => (
            <li key={row.id}>
              <button type="button" className="underline" onClick={() => setActive(row.id)}>
                @{row.handle} · {row.email}
                {row.suspendedAt ? ' · suspended' : ''}
              </button>
            </li>
          ))}
        </ul>
      </Tile>
      {detail.data ? (
        <Tile>
          <h1 className="font-display text-2xl font-semibold">{detail.data.displayName}</h1>
          <p className="text-sm text-text-secondary">
            @{detail.data.handle} · {detail.data.email}
            {detail.data.isMinor ? ' · minor' : ''}
          </p>
          <p className="mt-2 text-sm">
            {detail.data.counts.followers} followers · {detail.data.counts.posts} posts · {detail.data.counts.reports}{' '}
            reports
          </p>
          {detail.data.suspendedAt ? (
            <Button className="mt-3" type="button" onClick={() => unsuspend.mutate()}>
              {en.admin.unsuspend}
            </Button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <TextField name="reason" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="button" onClick={() => suspend.mutate()}>
                {en.admin.suspend}
              </Button>
            </div>
          )}
        </Tile>
      ) : null}
    </div>
  );
}

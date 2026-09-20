'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { EmptyState, Tile } from '@tessera/ui';
import { adminApi } from '../lib/api';

export default function AdminQueuePage() {
  const me = useQuery({ queryKey: ['admin-me'], queryFn: () => adminApi.me(), retry: false });
  const queue = useQuery({
    queryKey: ['admin-queue'],
    queryFn: () => adminApi.queue() as Promise<{ items: Array<{ id: string; summary: string; status: string; source: string; subjectHandle: string | null }> }>,
    enabled: Boolean(me.data),
  });

  if (me.isError) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {en.admin.signIn}
        </Link>
      </p>
    );
  }
  if (!me.data) return <p className="text-text-secondary">{en.common?.loading ?? 'Loading…'}</p>;

  const items = queue.data?.items ?? [];
  if (!items.length) {
    return <EmptyState title={en.empty.admin.title} body={en.empty.admin.body} />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.queue}</p>
      {items.map((row) => (
        <Tile key={row.id}>
          <Link href={`/cases/${row.id}`} className="block">
            <p className="text-xs uppercase tracking-[0.14em] text-slate">
              {row.status} · {row.source}
            </p>
            <p className="mt-1 font-medium">{row.summary}</p>
            {row.subjectHandle ? <p className="text-sm text-text-secondary">@{row.subjectHandle}</p> : null}
          </Link>
        </Tile>
      ))}
    </div>
  );
}

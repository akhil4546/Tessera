'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { Button, TextArea, Tile } from '@tessera/ui';
import { adminApi } from '../../../lib/api';

const ACTIONS = ['dismiss', 'takedown', 'restore', 'suspend', 'unsuspend', 'mark_sensitive', 'hide_comment', 'warn'] as const;

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<(typeof ACTIONS)[number]>('takedown');
  const [note, setNote] = useState('');
  const detail = useQuery({
    queryKey: ['admin-case', params.id],
    queryFn: () => adminApi.getCase(params.id) as Promise<{
      id: string;
      summary: string;
      status: string;
      source: string;
      targetKind: string;
      targetId: string;
      reports: { id: string; reason: string; details: string }[];
      actions: { id: string; kind: string; note: string; createdAt: string }[];
      preview: Record<string, unknown> | null;
    }>,
  });

  const claim = useMutation({
    mutationFn: () => adminApi.claim(params.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-case', params.id] }),
  });
  const act = useMutation({
    mutationFn: () => adminApi.act(params.id, kind, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-case', params.id] });
      router.push('/');
    },
  });

  if (detail.isError) {
    router.push('/login');
    return null;
  }
  if (!detail.data) return <p className="text-text-secondary">Loading…</p>;
  const row = detail.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Tile>
        <p className="text-xs uppercase tracking-[0.14em] text-slate">
          {row.status} · {row.source} · {row.targetKind}
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold">{row.summary}</h1>
        <pre className="mt-4 overflow-auto rounded-tile bg-surface-muted p-3 text-xs">
          {JSON.stringify(row.preview, null, 2)}
        </pre>
        <Button className="mt-3" type="button" variant="secondary" onClick={() => claim.mutate()}>
          {en.admin.claim}
        </Button>
      </Tile>
      <Tile>
        <p className="font-medium">Reports</p>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {row.reports.map((report) => (
            <li key={report.id}>
              {report.reason}
              {report.details ? ` — ${report.details}` : ''}
            </li>
          ))}
        </ul>
      </Tile>
      <Tile>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{en.admin.act}</span>
          <select
            className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof ACTIONS)[number])}
          >
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3">
          <TextArea name="note" label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button className="mt-3" type="button" onClick={() => act.mutate()} disabled={act.isPending}>
          {en.admin.act}
        </Button>
      </Tile>
    </div>
  );
}

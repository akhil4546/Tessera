'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { Button, Tile } from '@tessera/ui';
import { adminApi } from '../../lib/api';

export default function AppealsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['admin-appeals'],
    queryFn: () =>
      adminApi.appeals() as Promise<{
        items: Array<{ id: string; statement: string; status: string; handle: string | null }>;
      }>,
  });
  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'upheld' | 'rejected' }) =>
      adminApi.resolveAppeal(id, status, status === 'upheld' ? 'Restored after appeal.' : 'Appeal rejected.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-appeals'] }),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.appeals}</p>
      {(list.data?.items ?? []).map((row) => (
        <Tile key={row.id}>
          <p className="text-xs uppercase tracking-[0.14em] text-slate">{row.status}</p>
          <p className="mt-1">{row.statement}</p>
          {row.handle ? <p className="text-sm text-text-secondary">@{row.handle}</p> : null}
          {row.status === 'pending' ? (
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={() => resolve.mutate({ id: row.id, status: 'upheld' })}>
                Uphold
              </Button>
              <Button type="button" variant="secondary" onClick={() => resolve.mutate({ id: row.id, status: 'rejected' })}>
                Reject
              </Button>
            </div>
          ) : null}
        </Tile>
      ))}
    </div>
  );
}

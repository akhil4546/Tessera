'use client';

import { useQuery } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { Tile } from '@tessera/ui';
import { adminApi } from '../../lib/api';

export default function AuditPage() {
  const list = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () =>
      adminApi.audit() as Promise<{
        items: Array<{ id: string; adminEmail: string; action: string; targetKind: string; targetId: string; createdAt: string }>;
      }>,
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.audit}</p>
      {(list.data?.items ?? []).map((row) => (
        <Tile key={row.id}>
          <p className="text-xs text-slate">{new Date(row.createdAt).toLocaleString()}</p>
          <p className="font-medium">
            {row.adminEmail} · {row.action}
          </p>
          <p className="text-sm text-text-secondary">
            {row.targetKind} {row.targetId}
          </p>
        </Tile>
      ))}
    </div>
  );
}

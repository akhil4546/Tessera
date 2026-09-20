'use client';

import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { Button, TextField, Tile } from '@tessera/ui';
import { adminApi } from '../../lib/api';

export default function KeywordsPage() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const list = useQuery({
    queryKey: ['admin-keywords'],
    queryFn: () =>
      adminApi.keywords() as Promise<{ items: Array<{ id: string; keyword: string; action: string }> }>,
  });
  const add = useMutation({
    mutationFn: () => adminApi.addKeyword(keyword, 'queue'),
    onSuccess: () => {
      setKeyword('');
      void queryClient.invalidateQueries({ queryKey: ['admin-keywords'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.removeKeyword(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-keywords'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (keyword.trim()) add.mutate();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.keywords}</p>
      <Tile>
        <form className="flex gap-2" onSubmit={onSubmit}>
          <TextField name="keyword" label="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {(list.data?.items ?? []).map((row) => (
            <li key={row.id} className="flex items-center justify-between text-sm">
              <span>
                {row.keyword} · {row.action}
              </span>
              <Button variant="ghost" type="button" onClick={() => remove.mutate(row.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );
}

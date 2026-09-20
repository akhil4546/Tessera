'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import type { BoardVisibility } from '@tessera/types';
import { Button, EmptyState, TextField, Tile } from '@tessera/ui';
import { api } from '../../lib/api';

export default function BoardsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<BoardVisibility>('private');
  const [error, setError] = useState<string | null>(null);

  const mine = useQuery({ queryKey: ['boards'], queryFn: () => api.listBoards() });

  const create = useMutation({
    mutationFn: () => api.createBoard({ title, visibility }),
    onSuccess: async () => {
      setTitle('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
    onError: (err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')),
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('boards.title')}
      </p>
      <h1 className="font-display text-3xl font-semibold">{t('boards.title')}</h1>
      <p className="text-sm text-text-secondary">{t('boards.hint')}</p>
      <Tile>
        <form className="flex flex-col gap-3" onSubmit={onCreate}>
          <TextField name="title" label={t('boards.name')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {(['private', 'shared', 'public'] as const).map((value) => (
              <Button key={value} type="button" variant={visibility === value ? 'primary' : 'secondary'} onClick={() => setVisibility(value)}>
                {value === 'private' ? t('boards.private') : value === 'shared' ? t('boards.shared') : t('boards.public')}
              </Button>
            ))}
          </div>
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            {t('boards.create')}
          </Button>
        </form>
      </Tile>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {!mine.data?.items.length ? (
        <EmptyState title={t('empty.boards.title')} body={t('empty.boards.body')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {mine.data.items.map((board) => (
            <li key={board.id}>
              <Tile>
                <Link href={`/boards/${board.id}`} className="font-medium text-accent underline">
                  {board.title}
                </Link>
                <p className="mt-1 text-sm text-text-secondary">
                  {board.itemCount} · {board.visibility}
                  {board.viewer.pendingInvite ? ` · ${t('boards.accept')}` : ''}
                </p>
              </Tile>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, EmptyState, TextField, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function CirclesPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [memberHandle, setMemberHandle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['circles'], queryFn: () => api.listCircles() });
  const detail = useQuery({
    queryKey: ['circles', selected],
    queryFn: () => api.getCircle(selected!),
    enabled: Boolean(selected),
  });

  const create = useMutation({
    mutationFn: () => api.createCircle(name),
    onSuccess: async (circle) => {
      setName('');
      setSelected(circle.id);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['circles'] });
    },
    onError: (err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')),
  });

  const addMember = useMutation({
    mutationFn: () => api.addCircleMember(selected!, memberHandle),
    onSuccess: async () => {
      setMemberHandle('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['circles'] });
    },
    onError: (err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')),
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('circles.title')}
      </p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/settings">
          {t('settings.title')}
        </Link>
      </nav>
      <h1 className="font-display text-3xl font-semibold">{t('circles.title')}</h1>
      <p className="text-sm text-text-secondary">{t('circles.hint')}</p>
      <Tile>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onCreate}>
          <TextField name="name" label={t('circles.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {t('circles.create')}
          </Button>
        </form>
      </Tile>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {!list.data?.items.length ? (
        <EmptyState title={t('empty.circles.title')} body={t('empty.circles.body')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.items.map((circle) => (
            <li key={circle.id}>
              <button
                type="button"
                className={`flex min-h-11 w-full items-center justify-between rounded-tile px-4 text-left ${
                  selected === circle.id ? 'bg-accent-muted' : 'bg-surface-muted'
                }`}
                onClick={() => setSelected(circle.id)}
              >
                <span className="font-medium">{circle.name}</span>
                <span className="text-sm text-text-secondary">{circle.memberCount}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail.data ? (
        <Tile>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{detail.data.name}</h2>
            <Button
              variant="ghost"
              onClick={() => {
                void api.deleteCircle(detail.data.id).then(() => {
                  setSelected(null);
                  void queryClient.invalidateQueries({ queryKey: ['circles'] });
                });
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              addMember.mutate();
            }}
          >
            <TextField
              name="handle"
              label={t('circles.add')}
              value={memberHandle}
              onChange={(e) => setMemberHandle(e.target.value)}
            />
            <Button type="submit" disabled={addMember.isPending || !memberHandle.trim()}>
              {t('circles.add')}
            </Button>
          </form>
          <ul className="mt-4 flex flex-col gap-2">
            {detail.data.members.length === 0 ? (
              <li className="text-sm text-text-secondary">{t('circles.emptyMembers')}</li>
            ) : (
              detail.data.members.map((member) => (
                <li key={member.id} className="flex min-h-11 items-center justify-between">
                  <Link className="underline" href={`/u/${member.handle}`}>
                    {member.displayName} @{member.handle}
                  </Link>
                  <Button variant="ghost" onClick={() => void api.removeCircleMember(detail.data.id, member.handle).then(() => queryClient.invalidateQueries({ queryKey: ['circles'] }))}>
                    {t('common.delete')}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </Tile>
      ) : null}
    </div>
  );
}

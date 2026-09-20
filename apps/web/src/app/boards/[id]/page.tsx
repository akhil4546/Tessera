'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, EmptyState, TextField, Tile } from '@tessera/ui';
import { PostCard } from '../../../components/post-card';
import { api } from '../../../lib/api';

export default function BoardDetailPage() {
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ['board', params.id],
    queryFn: () => api.getBoard(params.id),
  });

  const invite = useMutation({
    mutationFn: () => api.inviteBoardCollaborator(params.id, handle),
    onSuccess: async () => {
      setHandle('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['board', params.id] });
    },
    onError: (err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')),
  });

  if (board.isError) {
    return <p className="text-text-secondary">{t('error.body')}</p>;
  }
  if (!board.data) return <p className="text-text-secondary">{t('common.loading')}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('boards.title')}
      </p>
      <nav className="text-sm">
        <Link className="underline" href="/boards">
          {t('boards.title')}
        </Link>
      </nav>
      <h1 className="font-display text-3xl font-semibold">{board.data.title}</h1>
      <p className="text-sm text-text-secondary">
        {board.data.description || `${board.data.visibility} · ${board.data.owner.displayName}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {board.data.viewer.pendingInvite ? (
          <>
            <Button onClick={() => void api.acceptBoardInvite(params.id).then(() => queryClient.invalidateQueries({ queryKey: ['board'] }))}>
              {t('boards.accept')}
            </Button>
            <Button variant="secondary" onClick={() => void api.declineBoardInvite(params.id).then(() => queryClient.invalidateQueries({ queryKey: ['boards'] }))}>
              {t('boards.decline')}
            </Button>
          </>
        ) : null}
        {board.data.visibility === 'public' && !board.data.viewer.isOwner ? (
          <Button
            variant={board.data.viewer.isFollower ? 'secondary' : 'primary'}
            onClick={() =>
              void (board.data.viewer.isFollower ? api.unfollowBoard(params.id) : api.followBoard(params.id)).then(() =>
                queryClient.invalidateQueries({ queryKey: ['board', params.id] }),
              )
            }
          >
            {board.data.viewer.isFollower ? t('boards.unfollow') : t('boards.follow')}
          </Button>
        ) : null}
      </div>
      {board.data.viewer.isOwner ? (
        <Tile>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <TextField name="handle" label={t('boards.invite')} value={handle} onChange={(e) => setHandle(e.target.value)} />
            <Button type="submit" disabled={!handle.trim() || invite.isPending}>
              {t('boards.invite')}
            </Button>
          </form>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        </Tile>
      ) : null}
      {!board.data.items.length ? (
        <EmptyState title={t('empty.boards.title')} body={t('empty.boards.body')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {board.data.items.map((item) => (
            <li key={item.id}>
              <PostCard post={item.post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

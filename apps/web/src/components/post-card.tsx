'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APPRECIATION_TYPES, appreciationMeta, type AppreciationType, type PostCard as PostCardModel } from '@tessera/types';
import { Button, TextField, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { PostMedia } from './post-media';
import { ReportDialog } from './report-dialog';
import { SensitiveGate } from './sensitive-gate';

function SaveToBoard({ postId }: { postId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: () => api.listBoards(),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (boardId?: string) => api.savePost(postId, boardId),
    onSuccess: (result) => {
      setMessage(`${t('boards.saved')} · ${result.board.title}`);
      setOpen(false);
    },
  });
  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => setOpen((value) => !value)}>
        {t('loop.save')}
      </Button>
      {open ? (
        <div className="absolute z-10 mt-1 min-w-48 rounded-tile border border-border bg-surface-elevated p-2 shadow-tile">
          <button type="button" className="block min-h-11 w-full rounded-tile px-3 text-left text-sm hover:bg-surface-muted" onClick={() => save.mutate(undefined)}>
            {t('boards.defaultSaved')}
          </button>
          {(boards.data?.items ?? [])
            .filter((board) => board.viewer.canAdd && !board.isDefault)
            .map((board) => (
              <button
                key={board.id}
                type="button"
                className="block min-h-11 w-full rounded-tile px-3 text-left text-sm hover:bg-surface-muted"
                onClick={() => save.mutate(board.id)}
              >
                {board.title}
              </button>
            ))}
        </div>
      ) : null}
      {message ? <p className="mt-1 text-xs text-moss">{message}</p> : null}
    </div>
  );
}

export function PostCard({ post }: { post: PostCardModel }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    void queryClient.invalidateQueries({ queryKey: ['post', post.id] });
    void queryClient.invalidateQueries({ queryKey: ['mosaic'] });
  };

  const appreciate = useMutation({
    mutationFn: (type: AppreciationType) =>
      post.appreciation.mine === type ? api.unappreciate(post.id) : api.appreciate(post.id, type),
    onSuccess: invalidate,
  });

  const comments = useQuery({
    queryKey: ['comments', post.id],
    queryFn: () => api.listComments(post.id),
    enabled: commentsOpen,
  });

  const sendComment = useMutation({
    mutationFn: () => api.createComment(post.id, draft),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
      invalidate();
    },
  });

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch {
        return null;
      }
    },
  });
  const hero = post.media[0];
  const defaultType = (me.data?.defaultAppreciation ?? 'love');

  return (
    <Tile className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/u/${post.author.handle}`} className="font-medium text-text-primary">
          {post.author.displayName}{' '}
          <span className="font-normal text-text-secondary">@{post.author.handle}</span>
        </Link>
        <div className="flex gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate">
          {post.unfiltered ? <span>{t('feed.badgeUnfiltered')}</span> : null}
          {post.authenticity === 'ai_generated' ? <span>{t('feed.badgeAi')}</span> : null}
          {post.editedAt ? <span>{t('common.edited')}</span> : null}
        </div>
      </div>
      {hero ? (
        <div
          className="relative bg-surface-muted"
          onDoubleClick={() => appreciate.mutate(defaultType)}
        >
          <SensitiveGate sensitive={post.sensitive} isAuthor={post.viewer.isAuthor}>
            <PostMedia item={hero} />
          </SensitiveGate>
          {post.media.length > 1 ? (
            <span className="absolute right-3 top-3 rounded-tile bg-overlay px-2 py-1 text-xs text-text-inverse">
              1/{post.media.length}
            </span>
          ) : null}
        </div>
      ) : null}
      {post.media.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {post.media.slice(1).map((item) => (
            <div key={item.id} className="h-20 w-20 shrink-0 overflow-hidden rounded-tile">
              <PostMedia item={item} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {APPRECIATION_TYPES.map((type) => {
            const meta = appreciationMeta[type];
            const active = post.appreciation.mine === type;
            const count = post.appreciation.counts?.[type];
            return (
              <button
                key={type}
                type="button"
                className={`inline-flex min-h-11 items-center gap-1 rounded-tile px-3 text-sm ${
                  active ? 'bg-accent-muted text-text-primary' : 'bg-surface-muted text-text-secondary'
                }`}
                onClick={() => appreciate.mutate(type)}
                aria-pressed={active}
                aria-label={t(meta.labelKey)}
              >
                <span aria-hidden>{meta.emoji}</span>
                <span>{t(meta.labelKey)}</span>
                {typeof count === 'number' ? <span>{count}</span> : null}
              </button>
            );
          })}
        </div>
        {!post.appreciation.counts ? (
          <p className="text-xs text-text-secondary">{t('feed.whyHidden')}</p>
        ) : null}
        {post.caption ? (
          <p className="text-text-primary">
            {post.caption}{' '}
            {post.hashtags.map((tag) => (
              <Link key={tag} className="text-accent underline" href={`/h/${tag}`}>
                #{tag}{' '}
              </Link>
            ))}
          </p>
        ) : null}
        {post.place ? (
          <p className="text-sm text-text-secondary">
            <Link className="underline" href={`/places/${post.place.slug}`}>
              {post.place.name}
            </Link>
          </p>
        ) : post.locationName ? (
          <p className="text-sm text-text-secondary">{post.locationName}</p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setCommentsOpen((v) => !v)}>
            {t('feed.comments')}
            {post.commentCount ? ` · ${post.commentCount}` : ''}
          </Button>
          <Link className="text-sm text-accent underline" href={post.kind === 'loop' ? `/loops/${post.id}` : `/p/${post.id}`}>
            {post.kind === 'loop' ? t('feed.openLoop') : 'Open'}
          </Link>
          <Button variant="ghost" onClick={() => setShareOpen((v) => !v)}>
            {t('inbox.sharePost')}
          </Button>
          <SaveToBoard postId={post.id} />
          <ReportDialog kind={post.kind === 'loop' ? 'loop' : 'post'} id={post.id} />
        </div>
        {post.takenDown && post.viewer.isAuthor ? (
          <p className="text-sm text-danger">This tile was taken down. You can appeal from Settings → Safety.</p>
        ) : null}
        {shareOpen ? <ShareToInbox postId={post.id} kind={post.kind} /> : null}
        {commentsOpen ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {comments.data?.items.map((comment) => (
              <div key={comment.id} className="flex flex-col gap-1 text-sm">
                <div>
                  <span className="font-medium">@{comment.author.handle}</span>{' '}
                  {comment.deleted ? (
                    <span className="text-text-secondary">removed</span>
                  ) : comment.hidden ? (
                    '…'
                  ) : (
                    comment.body
                  )}
                </div>
                <div className="flex gap-2">
                  <ReportDialog kind="comment" id={comment.id} />
                  {comment.hiddenByRestrict && post.viewer.isAuthor ? (
                    <Button variant="ghost" type="button" onClick={() => void api.approveComment(comment.id).then(invalidate)}>
                      {t('settings.approveComment')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {post.commentsEnabled ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.trim()) sendComment.mutate();
                }}
              >
                <TextField
                  name="comment"
                  label={t('feed.writeComment')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" disabled={sendComment.isPending}>
                  {t('feed.reply')}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </Tile>
  );
}

function ShareToInbox({ postId, kind }: { postId: string; kind: 'post' | 'loop' }) {
  const t = useTranslations();
  const threads = useQuery({
    queryKey: ['inbox', 'messages'],
    queryFn: () => api.inbox({ filter: 'messages' }),
  });
  const send = useMutation({
    mutationFn: (conversationId: string) =>
      api.sendMessage(conversationId, kind === 'loop' ? { kind: 'loop', loopId: postId } : { kind: 'post', postId }),
  });
  if (!threads.data) return <p className="text-sm text-text-secondary">{t('common.loading')}</p>;
  if (!threads.data.items.length) {
    return (
      <p className="text-sm text-text-secondary">
        <Link className="underline" href="/inbox/new">
          {t('inbox.newThread')}
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-sm font-medium">{t('inbox.pickThread')}</p>
      {threads.data.items
        .filter((entry) => entry.type === 'thread')
        .map((entry) => (
        <button
          key={entry.conversation.id}
          type="button"
          className="min-h-11 rounded-tile bg-surface-muted px-3 text-left text-sm"
          onClick={() => send.mutate(entry.conversation.id)}
        >
          {entry.conversation.title ?? entry.conversation.members.map((row) => row.user.displayName).join(', ')}
        </button>
      ))}
      {send.isSuccess ? <p className="text-sm text-moss">{t('inbox.send')}</p> : null}
    </div>
  );
}

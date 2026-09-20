'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationView, InboxFilter, NotificationView } from '@tessera/types';
import { INBOX_FILTERS } from '@tessera/types';
import { Button, EmptyState, Skeleton, Tile } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';
import { connectInboxSocket } from '../lib/inbox-socket';

function previewBody(conversation: ConversationView): string {
  const last = conversation.lastMessage;
  if (!last) return '';
  if (last.deletedAt) return 'Message unsent';
  if (last.kind === 'voice') return 'Voice note';
  if (last.kind === 'image') return 'Photo';
  if (last.kind === 'video') return 'Video';
  if (last.kind === 'post' || last.kind === 'loop' || last.kind === 'moment') return last.share?.title ?? 'Shared tile';
  return last.body;
}

function emptyCopy(filter: InboxFilter, t: ReturnType<typeof useTranslations>): { title: string; body: string } {
  if (filter === 'requests') return { title: t('empty.requests.title'), body: t('empty.requests.body') };
  if (filter === 'messages') return { title: t('empty.inbox.title'), body: t('empty.inbox.body') };
  return { title: t('empty.activity.title'), body: t('empty.activity.body') };
}

function ActivityRow({ notification }: { notification: NotificationView }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const href = notification.href ?? '/inbox';
  return (
    <Tile className="flex flex-col gap-2 p-4">
      <Link
        href={href}
        onClick={() => {
          if (!notification.readAt) {
            void api.markNotificationsRead({ ids: [notification.id] }).then(() => {
              void queryClient.invalidateQueries({ queryKey: ['inbox'] });
            });
          }
        }}
        className="flex items-start justify-between gap-3"
      >
        <div>
          <p className={`text-text-primary ${notification.readAt ? 'font-normal' : 'font-medium'}`}>
            {notification.body}
            {!notification.readAt ? (
              <span className="ml-2 rounded-tile bg-accent px-2 py-0.5 text-xs text-text-inverse">
                {t('inbox.unread')}
              </span>
            ) : null}
          </p>
          {notification.preview ? (
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{notification.preview}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate">
            {notification.actors.map((actor) => actor.displayName).join(', ')}
          </p>
        </div>
      </Link>
    </Tile>
  );
}

function ThreadRow({ conversation }: { conversation: ConversationView }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: (id: string) => api.acceptMessageRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const decline = useMutation({
    mutationFn: (id: string) => api.declineMessageRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const other = conversation.members.find((row) => row.online);
  const heading = conversation.title ?? conversation.members.map((row) => row.user.displayName).join(', ');
  const incoming = conversation.request?.status === 'pending' && conversation.request.incoming;
  return (
    <Tile className="flex flex-col gap-2 p-4">
      <Link href={`/inbox/${conversation.id}`} className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-text-primary">
            {heading}
            {conversation.unreadCount > 0 ? (
              <span className="ml-2 rounded-tile bg-accent px-2 py-0.5 text-xs text-text-inverse">
                {conversation.unreadCount}
              </span>
            ) : null}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{previewBody(conversation)}</p>
          {conversation.request?.status === 'pending' && !conversation.request.incoming ? (
            <p className="mt-1 text-xs text-slate">{t('inbox.waiting')}</p>
          ) : null}
        </div>
        {other?.online ? (
          <span className="mt-1 size-2.5 shrink-0 rounded-full bg-moss" aria-label={t('inbox.online')} />
        ) : null}
      </Link>
      {incoming && conversation.request ? (
        <div className="flex gap-2">
          <Button onClick={() => accept.mutate(conversation.request!.id)}>{t('inbox.accept')}</Button>
          <Button variant="secondary" onClick={() => decline.mutate(conversation.request!.id)}>
            {t('inbox.decline')}
          </Button>
        </div>
      ) : null}
    </Tile>
  );
}

export function InboxList({ filter }: { filter: InboxFilter }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['inbox', filter],
    queryFn: () => api.inbox({ filter }),
  });

  useEffect(() => {
    return connectInboxSocket(() => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    });
  }, [queryClient]);

  const markAll = useMutation({
    mutationFn: () => api.markNotificationsRead({ all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });

  if (list.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (list.error instanceof TesseraApiError && list.error.status === 401) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }
  if (!list.data?.items.length) {
    const copy = emptyCopy(filter, t);
    return (
      <EmptyState
        title={copy.title}
        body={copy.body}
        action={
          filter === 'requests' || filter === 'mentions' || filter === 'appreciations' || filter === 'follows' ? undefined : (
            <Button asChild>
              <Link href="/inbox/new">{t('inbox.newThread')}</Link>
            </Button>
          )
        }
      />
    );
  }

  const activityUnread = list.data.unreadActivity > 0;

  return (
    <div className="flex flex-col gap-3">
      {activityUnread && filter !== 'messages' && filter !== 'requests' ? (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => markAll.mutate()}>
            {t('inbox.markRead')}
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {list.data.items.map((entry) => (
          <li key={entry.type === 'thread' ? `t-${entry.conversation.id}` : `a-${entry.notification.id}`}>
            {entry.type === 'thread' ? (
              <ThreadRow conversation={entry.conversation} />
            ) : (
              <ActivityRow notification={entry.notification} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FILTER_LABEL: Record<InboxFilter, 'inbox.all' | 'inbox.messages' | 'inbox.mentions' | 'inbox.appreciations' | 'inbox.follows' | 'inbox.requests'> =
  {
    all: 'inbox.all',
    messages: 'inbox.messages',
    mentions: 'inbox.mentions',
    appreciations: 'inbox.appreciations',
    follows: 'inbox.follows',
    requests: 'inbox.requests',
  };

export function InboxFilters({ value }: { value: InboxFilter }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-2">
      {INBOX_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={filter === 'all' ? '/inbox' : `/inbox?filter=${filter}`}
          className={`inline-flex min-h-11 items-center rounded-tile px-4 text-sm font-medium ${
            value === filter ? 'bg-accent text-text-inverse' : 'bg-surface-muted text-text-secondary'
          }`}
        >
          {t(FILTER_LABEL[filter])}
        </Link>
      ))}
    </div>
  );
}

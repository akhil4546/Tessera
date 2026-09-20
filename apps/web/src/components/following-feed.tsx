'use client';

import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, EmptyState, Skeleton } from '@tessera/ui';
import { api } from '../lib/api';
import Link from 'next/link';
import { MomentTray } from './moment-tray';
import { PostCard } from './post-card';

export function FollowingFeed() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch (err) {
        if (err instanceof TesseraApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  const feed = useQuery({
    queryKey: ['feed', 'following'],
    queryFn: () => api.followingFeed(),
    enabled: Boolean(me.data),
  });

  const older = useQuery({
    queryKey: ['feed', 'older'],
    queryFn: () => api.followingFeed({ keepGoing: true }),
    enabled: false,
  });

  const caughtUp = useMutation({
    mutationFn: () => api.markCaughtUp(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  if (me.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!me.data) {
    return <EmptyState title={t('empty.home.title')} body={t('empty.home.body')} />;
  }

  if (feed.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const items = feed.data?.items ?? [];
  const emptyFeed = items.length === 0 && !feed.data?.finishLine?.olderAvailable;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <MomentTray />
      <Link
        href="/loops"
        className="inline-flex min-h-11 items-center self-start rounded-tile bg-surface-muted px-4 text-sm font-medium text-text-primary"
      >
        {t('feed.loops')}
      </Link>
      {emptyFeed ? <EmptyState title={t('empty.feed.title')} body={t('empty.feed.body')} /> : null}
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {feed.data?.finishLine?.reached ? (
        <EmptyState
          title={t('empty.caughtUp.title')}
          body={`${feed.data.finishLine.seenSinceLastVisit} ${t('feed.seen')}. ${t('empty.caughtUp.body')}`}
          action={
            feed.data.finishLine.olderAvailable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await caughtUp.mutateAsync();
                  await older.refetch();
                }}
              >
                {t('feed.keepGoing')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => caughtUp.mutate()}>
                {t('empty.caughtUp.title')}
              </Button>
            )
          }
        />
      ) : null}
      {older.data?.items.map((post) => (
        <PostCard key={`old-${post.id}`} post={post} />
      ))}
    </div>
  );
}

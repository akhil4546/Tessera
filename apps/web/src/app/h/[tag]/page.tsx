'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState } from '@tessera/ui';
import { api } from '../../../lib/api';
import { PostCard } from '../../../components/post-card';

export default function HashtagPage() {
  const tag = useParams<{ tag: string }>().tag;
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<'top' | 'recent'>('top');
  const page = useQuery({
    queryKey: ['hashtag', tag, sort],
    queryFn: () => api.hashtagPage(tag, { sort }),
  });
  const follow = useMutation({
    mutationFn: () => (page.data?.followed ? api.unfollowHashtag(tag) : api.followHashtag(tag)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hashtag', tag] }),
  });

  if (page.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (!page.data) return <EmptyState title={`#${tag}`} body={t('empty.discover.body')} />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">#{page.data.tag}</h1>
          <p className="text-sm text-text-secondary">{page.data.postCount} posts</p>
        </div>
        <Button variant={page.data.followed ? 'secondary' : 'primary'} onClick={() => follow.mutate()}>
          {page.data.followed ? t('discover.unfollowTag') : t('discover.followTag')}
        </Button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-tile px-3 text-sm ${sort === 'top' ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
          onClick={() => setSort('top')}
        >
          {t('discover.top')}
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-tile px-3 text-sm ${sort === 'recent' ? 'bg-text-primary text-text-inverse' : 'bg-surface-muted'}`}
          onClick={() => setSort('recent')}
        >
          {t('discover.recentSort')}
        </button>
      </div>
      {page.data.items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { ErrorState } from '@tessera/ui';
import { PostCard } from '../../../components/post-card';
import { api } from '../../../lib/api';

export default function PostPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations();
  const query = useQuery({
    queryKey: ['post', params.id],
    queryFn: () => api.getPost(params.id),
  });
  if (query.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (query.error) {
    const notFound = query.error instanceof TesseraApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Not found' : t('error.title')}
        body={notFound ? 'That post is gone, private, or never existed.' : t('error.body')}
        retryLabel={t('error.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (!query.data) return null;
  return (
    <div className="mx-auto max-w-xl">
      <PostCard post={query.data} />
    </div>
  );
}

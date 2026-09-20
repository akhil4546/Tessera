'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { ErrorState } from '@tessera/ui';
import { ProfileCard } from '../../../components/profile-card';
import { api } from '../../../lib/api';

export default function UserProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;
  const t = useTranslations();
  const query = useQuery({
    queryKey: ['profile', handle],
    queryFn: () => api.getProfile(handle),
  });

  if (query.isLoading) return <p className="text-text-secondary">{t('common.loading')}</p>;
  if (query.error) {
    const notFound = query.error instanceof TesseraApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Not found' : t('error.title')}
        body={notFound ? 'No account with that handle.' : t('error.body')}
        retryLabel={t('error.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (!query.data) return null;
  return <ProfileCard profile={query.data} />;
}

import { getTranslations } from 'next-intl/server';
import { FollowingFeed } from '../components/following-feed';

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('nav.home')}
      </p>
      <FollowingFeed />
    </div>
  );
}

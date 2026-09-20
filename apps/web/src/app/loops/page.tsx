import { getTranslations } from 'next-intl/server';
import { LoopPlayer } from '../../components/loop-player';

export default async function LoopsPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('feed.loops')}
      </p>
      <LoopPlayer />
    </div>
  );
}

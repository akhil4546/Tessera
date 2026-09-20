'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { MosaicView } from '@tessera/types';
import { EmptyState } from '@tessera/ui';
import { PostMedia } from './post-media';

export function MosaicGrid({ mosaic, isSelf }: { mosaic: MosaicView; isSelf?: boolean }) {
  const t = useTranslations();
  if (mosaic.tiles.length === 0) {
    return <EmptyState title={t('empty.mosaic.title')} body={t('empty.mosaic.body')} />;
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {mosaic.tiles.map((tile) => {
        const media = tile.post.media[0];
        return (
          <Link
            key={`${tile.role}-${tile.post.id}`}
            href={tile.post.kind === 'loop' ? `/loops/${tile.post.id}` : `/p/${tile.post.id}`}
            className="overflow-hidden rounded-tile bg-surface-muted"
            style={{
              gridColumn: `span ${tile.span.cols}`,
              gridRow: `span ${tile.span.rows}`,
              minHeight: tile.role === 'hero' ? 280 : 120,
            }}
          >
            {media ? <PostMedia item={media} sizes="(min-width: 720px) 240px, 50vw" /> : null}
            {tile.role === 'hero' && isSelf ? (
              <span className="sr-only">{t('mosaic.heroes')}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

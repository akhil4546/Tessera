'use client';

import type { MediaView } from '@tessera/types';
import { mediaSrc } from '../lib/media';

export function PostMedia({
  item,
  sizes = '(min-width: 720px) 640px, 100vw',
}: {
  item: MediaView;
  sizes?: string;
}) {
  const src = item.srcset[item.srcset.length - 1];
  const webp = mediaSrc(src?.webp);
  const avif = mediaSrc(src?.avif);
  const poster = mediaSrc(item.posterUrl);
  if (item.kind === 'video' && item.hlsUrl) {
    return (
      <video
        className="h-full w-full object-cover"
        poster={poster}
        controls
        playsInline
        preload="metadata"
        aria-label={item.altText || 'Video'}
      >
        <source src={mediaSrc(item.hlsUrl)} type="application/vnd.apple.mpegurl" />
        <track kind="captions" srcLang="en" label="Captions" />
      </video>
    );
  }
  if (!webp) {
    return (
      <div
        className="flex min-h-48 items-center justify-center bg-surface-muted text-sm text-text-secondary"
        style={item.blurhash ? { background: 'var(--tessera-surface-muted)' } : undefined}
      >
        {item.status === 'ready' ? item.altText || 'Photo' : 'Processing…'}
      </div>
    );
  }
  return (
    <picture>
      {avif ? (
        <source
          type="image/avif"
          srcSet={item.srcset.map((v) => `${mediaSrc(v.avif)} ${v.width}w`).join(', ')}
          sizes={sizes}
        />
      ) : null}
      <source
        type="image/webp"
        srcSet={item.srcset.map((v) => `${mediaSrc(v.webp)} ${v.width}w`).join(', ')}
        sizes={sizes}
      />
      <img
        src={webp}
        alt={item.altText || ''}
        width={item.width ?? undefined}
        height={item.height ?? undefined}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </picture>
  );
}

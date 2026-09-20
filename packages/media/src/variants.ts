export type VariantMap = {
  widths: Record<string, { webp: string; avif: string }>;
  posterKey?: string;
  hls?: { masterKey: string };
  audioKey?: string;
  captionsKey?: string;
};

export function emptyVariants(): VariantMap {
  return { widths: {} };
}

export function asVariantMap(value: unknown): VariantMap {
  if (!value || typeof value !== 'object') return emptyVariants();
  const row = value as VariantMap;
  return {
    widths: row.widths ?? {},
    posterKey: row.posterKey,
    hls: row.hls,
    audioKey: row.audioKey,
    captionsKey: row.captionsKey,
  };
}

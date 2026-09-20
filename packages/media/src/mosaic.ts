export type MosaicSpan = { cols: 1 | 2; rows: 1 | 2 };

export type MosaicRole = 'hero' | 'tile';

export function mosaicSpan(aspect: number, role: MosaicRole): MosaicSpan {
  if (role === 'hero') return { cols: 2, rows: 2 };
  if (aspect >= 1.4) return { cols: 2, rows: 1 };
  if (aspect <= 0.75) return { cols: 1, rows: 2 };
  return { cols: 1, rows: 1 };
}

export const MOSAIC_COLUMNS = 4;
export const MAX_HERO_TILES = 3;

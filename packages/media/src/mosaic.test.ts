import { describe, expect, it } from 'vitest';
import { mosaicSpan } from './mosaic.ts';

describe('mosaicSpan', () => {
  it('uses 2x2 for hero tiles and mixed sizes otherwise', () => {
    expect(mosaicSpan(1, 'hero')).toEqual({ cols: 2, rows: 2 });
    expect(mosaicSpan(1.8, 'tile')).toEqual({ cols: 2, rows: 1 });
    expect(mosaicSpan(0.6, 'tile')).toEqual({ cols: 1, rows: 2 });
    expect(mosaicSpan(1, 'tile')).toEqual({ cols: 1, rows: 1 });
  });
});

/**
 * Tessera raw palette. Prefer semantic tokens in `semantic.ts` at call sites.
 */
export const palette = {
  ink: '#1F1B16',
  sand: '#F4EDE3',
  terracotta: '#C8553D',
  moss: '#5B7553',
  slate: '#4A5A6A',
} as const;

export const darkPalette = {
  /** Warm near-black, not pure #000. */
  ink: '#1C1916',
  sand: '#F4EDE3',
  terracotta: '#D46850',
  moss: '#8FA887',
  slate: '#8A9AAB',
} as const;

export type PaletteName = keyof typeof palette;

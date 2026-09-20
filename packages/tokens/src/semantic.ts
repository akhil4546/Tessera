import { darkPalette, palette } from './palette';

export const lightSemantic = {
  surface: palette.sand,
  surfaceElevated: '#FFFBF6',
  surfaceMuted: '#E8DFD2',
  textPrimary: palette.ink,
  textSecondary: '#5C534A',
  textInverse: palette.sand,
  /** Darker than raw terracotta so sand label text meets WCAG AA on filled buttons. */
  accent: '#B04732',
  accentHover: '#9B3F2C',
  accentMuted: '#F3D4CC',
  moss: palette.moss,
  slate: palette.slate,
  danger: '#A33B3B',
  border: '#D9CFC2',
  borderStrong: '#C4B8A8',
  ring: palette.terracotta,
  overlay: 'rgba(31, 27, 22, 0.48)',
  shadowTile: '0 1px 2px rgb(31 27 22 / 0.06), 0 8px 24px rgb(31 27 22 / 0.06)',
} as const;

export const darkSemantic = {
  surface: darkPalette.ink,
  surfaceElevated: '#26211C',
  surfaceMuted: '#2F2923',
  textPrimary: darkPalette.sand,
  textSecondary: '#C4B8A8',
  textInverse: darkPalette.ink,
  accent: darkPalette.terracotta,
  accentHover: '#E07A64',
  accentMuted: '#4A2C26',
  moss: darkPalette.moss,
  slate: darkPalette.slate,
  danger: '#E07070',
  border: '#3A332C',
  borderStrong: '#52483E',
  ring: darkPalette.terracotta,
  overlay: 'rgba(0, 0, 0, 0.64)',
  shadowTile: '0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px rgb(0 0 0 / 0.35)',
} as const;

export type SemanticTokenName = keyof typeof lightSemantic;

export const requiredSemanticKeys = [
  'surface',
  'surfaceElevated',
  'surfaceMuted',
  'textPrimary',
  'textSecondary',
  'textInverse',
  'accent',
  'accentHover',
  'accentMuted',
  'moss',
  'slate',
  'danger',
  'border',
  'borderStrong',
  'ring',
  'overlay',
  'shadowTile',
] as const satisfies readonly SemanticTokenName[];

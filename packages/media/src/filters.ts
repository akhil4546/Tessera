/**
 * Twelve original Tessera filters. Names are not Instagram's.
 * CSS is for the editor preview; Sharp ops are baked at publish.
 */

export const FILTER_IDS = [
  'clay',
  'moss',
  'ink',
  'sand',
  'hearth',
  'tide',
  'honey',
  'slate',
  'dusk',
  'grain',
  'grove',
  'ember',
] as const;

export type FilterId = (typeof FILTER_IDS)[number];

export type NamedFilter = {
  id: FilterId;
  name: string;
  css: string;
  /** 0–1 strength of a warm/cool overlay after modulate. */
  tint?: { r: number; g: number; b: number };
  grayscale?: boolean;
  modulate?: { brightness?: number; saturation?: number; hue?: number };
  linear?: { a: number; b: number };
};

export const FILTERS: Record<FilterId, NamedFilter> = {
  clay: {
    id: 'clay',
    name: 'Clay',
    css: 'sepia(0.35) saturate(1.2) hue-rotate(-18deg) contrast(1.05)',
    modulate: { saturation: 1.15, hue: -12 },
    tint: { r: 200, g: 120, b: 90 },
  },
  moss: {
    id: 'moss',
    name: 'Moss',
    css: 'hue-rotate(55deg) saturate(0.85) brightness(0.98)',
    modulate: { saturation: 0.9, hue: 40, brightness: 0.98 },
    tint: { r: 120, g: 150, b: 110 },
  },
  ink: {
    id: 'ink',
    name: 'Ink',
    css: 'grayscale(1) contrast(1.35) brightness(0.95)',
    grayscale: true,
    linear: { a: 1.25, b: -12 },
  },
  sand: {
    id: 'sand',
    name: 'Sand',
    css: 'sepia(0.2) saturate(0.75) brightness(1.08) contrast(0.92)',
    modulate: { saturation: 0.8, brightness: 1.06 },
    linear: { a: 0.92, b: 10 },
    tint: { r: 220, g: 200, b: 170 },
  },
  hearth: {
    id: 'hearth',
    name: 'Hearth',
    css: 'sepia(0.45) saturate(1.3) hue-rotate(-8deg) brightness(1.02)',
    modulate: { saturation: 1.2, brightness: 1.02, hue: -8 },
    tint: { r: 220, g: 140, b: 80 },
  },
  tide: {
    id: 'tide',
    name: 'Tide',
    css: 'hue-rotate(160deg) saturate(0.9) brightness(1.02) contrast(1.05)',
    modulate: { saturation: 0.92, hue: 140, brightness: 1.02 },
    tint: { r: 90, g: 150, b: 180 },
  },
  honey: {
    id: 'honey',
    name: 'Honey',
    css: 'sepia(0.5) saturate(1.25) brightness(1.08)',
    modulate: { saturation: 1.18, brightness: 1.06 },
    tint: { r: 230, g: 180, b: 80 },
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    css: 'saturate(0.45) contrast(1.1) brightness(0.98)',
    modulate: { saturation: 0.5, brightness: 0.98 },
    linear: { a: 1.08, b: -4 },
    tint: { r: 140, g: 150, b: 165 },
  },
  dusk: {
    id: 'dusk',
    name: 'Dusk',
    css: 'hue-rotate(-40deg) saturate(0.8) brightness(0.92) contrast(1.08)',
    modulate: { saturation: 0.85, hue: -30, brightness: 0.92 },
    tint: { r: 90, g: 70, b: 130 },
  },
  grain: {
    id: 'grain',
    name: 'Grain',
    css: 'contrast(1.12) brightness(1.02) saturate(0.9)',
    modulate: { saturation: 0.9, brightness: 1.02 },
    linear: { a: 1.1, b: -6 },
  },
  grove: {
    id: 'grove',
    name: 'Grove',
    css: 'hue-rotate(70deg) saturate(1.1) contrast(1.05)',
    modulate: { saturation: 1.08, hue: 55 },
    tint: { r: 90, g: 140, b: 80 },
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    css: 'sepia(0.4) saturate(1.4) hue-rotate(-25deg) contrast(1.1) brightness(0.96)',
    modulate: { saturation: 1.25, hue: -20, brightness: 0.96 },
    tint: { r: 180, g: 70, b: 50 },
  },
};

export const FILTER_LIST: NamedFilter[] = FILTER_IDS.map((id) => FILTERS[id]);

export function isFilterId(value: string): value is FilterId | 'none' {
  return value === 'none' || (FILTER_IDS as readonly string[]).includes(value);
}

/** Instagram filter names we must never ship as Tessera names. */
export const FORBIDDEN_FILTER_NAMES = [
  'clarendon',
  'juno',
  'lark',
  'gingham',
  'moon',
  'nashville',
  'valencia',
  'kelvin',
  'toaster',
  'lo-fi',
  'lofi',
  'inkwell',
  'aden',
  'ludwig',
  'x-pro ii',
  'sierra',
] as const;

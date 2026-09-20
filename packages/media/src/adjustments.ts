export type MediaAdjustments = {
  brightness: number;
  contrast: number;
  warmth: number;
  saturation: number;
  fade: number;
  vignette: number;
  sharpen: number;
};

export const ZERO_ADJUSTMENTS: MediaAdjustments = {
  brightness: 0,
  contrast: 0,
  warmth: 0,
  saturation: 0,
  fade: 0,
  vignette: 0,
  sharpen: 0,
};

export function parseAdjustments(value: unknown): MediaAdjustments {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const num = (key: keyof MediaAdjustments) => {
    const n = row[key];
    return typeof n === 'number' && Number.isFinite(n) ? clamp(n, -100, 100) : 0;
  };
  return {
    brightness: num('brightness'),
    contrast: num('contrast'),
    warmth: num('warmth'),
    saturation: num('saturation'),
    fade: clamp(typeof row.fade === 'number' ? row.fade : 0, 0, 100),
    vignette: clamp(typeof row.vignette === 'number' ? row.vignette : 0, 0, 100),
    sharpen: clamp(typeof row.sharpen === 'number' ? row.sharpen : 0, 0, 100),
  };
}

export function adjustmentsAreIdentity(value: MediaAdjustments): boolean {
  return (
    value.brightness === 0 &&
    value.contrast === 0 &&
    value.warmth === 0 &&
    value.saturation === 0 &&
    value.fade === 0 &&
    value.vignette === 0 &&
    value.sharpen === 0
  );
}

export function adjustmentsToCss(value: MediaAdjustments): string {
  const brightness = 1 + value.brightness / 100;
  const contrast = 1 + value.contrast / 100;
  const saturate = 1 + value.saturation / 100;
  const sepia = Math.max(0, value.warmth) / 200;
  const hue = (value.warmth / 100) * -12;
  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    `sepia(${sepia.toFixed(3)})`,
    `hue-rotate(${hue.toFixed(1)}deg)`,
  ].join(' ');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

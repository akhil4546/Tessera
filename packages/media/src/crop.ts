export type CropAspect = 'original' | 'square' | 'portrait' | 'landscape';

const RATIOS: Record<Exclude<CropAspect, 'original'>, number> = {
  square: 1,
  portrait: 4 / 5,
  landscape: 3 / 2,
};

export function cropRect(
  width: number,
  height: number,
  crop: CropAspect,
): { left: number; top: number; width: number; height: number } | null {
  if (crop === 'original') return null;
  const target = RATIOS[crop];
  const current = width / height;
  if (Math.abs(current - target) < 0.01) return { left: 0, top: 0, width, height };
  if (current > target) {
    const nextWidth = Math.round(height * target);
    const left = Math.round((width - nextWidth) / 2);
    return { left, top: 0, width: nextWidth, height };
  }
  const nextHeight = Math.round(width / target);
  const top = Math.round((height - nextHeight) / 2);
  return { left: 0, top, width, height: nextHeight };
}

import { encode } from 'blurhash';
import sharp from 'sharp';
import { parseAdjustments, type MediaAdjustments } from './adjustments.ts';
import { cropRect, type CropAspect } from './crop.ts';
import { FILTERS, type FilterId } from './filters.ts';

export const VARIANT_WIDTHS = [150, 320, 640, 1080] as const;

export type ImageVariant = {
  width: number;
  height: number;
  avif: Buffer;
  webp: Buffer;
};

export type ProcessedImage = {
  width: number;
  height: number;
  aspect: number;
  blurhash: string;
  variants: ImageVariant[];
};

export async function processImage(
  input: Buffer,
  options: {
    crop?: CropAspect;
    filterId?: string;
    adjustments?: unknown;
  } = {},
): Promise<ProcessedImage> {
  // rotate() applies EXIF orientation; we never copy metadata, so GPS/EXIF is stripped.
  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  if (!srcWidth || !srcHeight) {
    throw new Error('Could not read image dimensions.');
  }

  const crop = cropRect(srcWidth, srcHeight, options.crop ?? 'original');
  if (crop) {
    pipeline = pipeline.extract(crop);
  }

  const adjustments = parseAdjustments(options.adjustments);
  pipeline = applyLooks(pipeline, options.filterId ?? 'none', adjustments);

  const raster = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = raster.info.width;
  const height = raster.info.height;
  let baked = await sharp(raster.data, {
    raw: { width, height, channels: raster.info.channels },
  })
    .png()
    .toBuffer();
  if (adjustments.vignette > 0) {
    baked = await applyVignette(baked, adjustments.vignette);
  }

  const hashSource = await sharp(baked)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(
    new Uint8ClampedArray(hashSource.data),
    hashSource.info.width,
    hashSource.info.height,
    4,
    4,
  );

  const variants: ImageVariant[] = [];
  for (const target of VARIANT_WIDTHS) {
    if (target > width && target !== VARIANT_WIDTHS[0]) continue;
    const resized = sharp(baked).resize({
      width: Math.min(target, width),
      withoutEnlargement: true,
    });
    const info = await resized.clone().metadata();
    const outWidth = Math.min(target, width);
    const outHeight = Math.round((height / width) * outWidth);
    const [avif, webp] = await Promise.all([
      resized.clone().avif({ quality: 55 }).toBuffer(),
      resized.clone().webp({ quality: 72 }).toBuffer(),
    ]);
    variants.push({
      width: info.width ?? outWidth,
      height: info.height ?? outHeight,
      avif,
      webp,
    });
  }

  return {
    width,
    height,
    aspect: width / height,
    blurhash,
    variants,
  };
}

function applyLooks(
  pipeline: sharp.Sharp,
  filterId: string,
  adjustments: MediaAdjustments,
): sharp.Sharp {
  const filter = filterId !== 'none' && filterId in FILTERS ? FILTERS[filterId as FilterId] : null;

  const brightness = 1 + adjustments.brightness / 100 + ((filter?.modulate?.brightness ?? 1) - 1);
  const saturation = 1 + adjustments.saturation / 100;
  const satMul = (filter?.modulate?.saturation ?? 1) * saturation;
  const hue = (filter?.modulate?.hue ?? 0) + (adjustments.warmth / 100) * -12;

  pipeline = pipeline.modulate({
    brightness: clampPositive(brightness),
    saturation: clampPositive(satMul),
    hue,
  });

  if (filter?.grayscale) pipeline = pipeline.grayscale();

  const a = (filter?.linear?.a ?? 1) * (1 + adjustments.contrast / 100);
  const b = (filter?.linear?.b ?? 0) + adjustments.fade * 0.4;
  if (a !== 1 || b !== 0) pipeline = pipeline.linear(a, b);

  if (filter?.tint) {
    pipeline = pipeline.tint(filter.tint);
  } else if (adjustments.warmth !== 0) {
    const warm = adjustments.warmth;
    pipeline = pipeline.tint({
      r: 128 + Math.round(warm * 0.6),
      g: 128 + Math.round(warm * 0.15),
      b: 128 - Math.round(warm * 0.4),
    });
  }

  if (adjustments.sharpen > 0) {
    pipeline = pipeline.sharpen({ sigma: 0.5 + adjustments.sharpen / 80 });
  }

  return pipeline;
}

export async function applyVignette(png: Buffer, amount: number): Promise<Buffer> {
  if (amount <= 0) return png;
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const strength = Math.min(1, amount / 100);
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="72%">
          <stop offset="55%" stop-color="white" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="${(0.55 * strength).toFixed(3)}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
  return sharp(png)
    .composite([{ input: svg, blend: 'multiply' }])
    .png()
    .toBuffer();
}

function clampPositive(n: number): number {
  return Math.min(3, Math.max(0.1, n));
}

export async function stripExifProof(
  input: Buffer,
): Promise<{ hasGps: boolean; hasExif: boolean }> {
  const processed = await sharp(input).rotate().toBuffer();
  const meta = await sharp(processed).metadata();
  return {
    hasGps: Boolean(meta.exif && Buffer.from(meta.exif).includes('GPS')),
    hasExif: Boolean(meta.exif && meta.exif.length > 0),
  };
}

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processImage, stripExifProof } from './process-image.ts';

describe('processImage', () => {
  it('strips metadata and writes variants', async () => {
    const input = await sharp({
      create: { width: 80, height: 100, channels: 3, background: { r: 200, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();

    const processed = await processImage(input, { crop: 'square', filterId: 'clay' });
    expect(processed.width).toBe(processed.height);
    expect(processed.variants.length).toBeGreaterThan(0);
    expect(processed.blurhash.length).toBeGreaterThan(6);

    const proof = await stripExifProof(input);
    expect(proof.hasExif).toBe(false);
    expect(proof.hasGps).toBe(false);
  });
});

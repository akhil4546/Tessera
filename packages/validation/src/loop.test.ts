import { describe, expect, it } from 'vitest';
import { createLoopSchema, watchLoopSchema, wellbeingUpdateSchema } from './loop';

describe('createLoopSchema', () => {
  it('accepts a single clip with original audio', () => {
    const parsed = createLoopSchema.safeParse({
      clips: [{ mediaId: 'm1', trimEndMs: 4000 }],
      authenticity: 'unfiltered',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.clips[0]?.speed).toBe(1);
      expect(parsed.data.allowAudioReuse).toBe(true);
    }
  });

  it('rejects licensed-music-shaped extra fields by stripping them, and rejects empty clips', () => {
    expect(createLoopSchema.safeParse({ clips: [], authenticity: 'edited' }).success).toBe(false);
    const parsed = createLoopSchema.safeParse({
      clips: [{ mediaId: 'm1', trimEndMs: 2000 }],
      authenticity: 'edited',
      musicId: 'spotify:track:nope',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('musicId' in parsed.data).toBe(false);
    }
  });

  it('rejects trim end before start and unknown speeds', () => {
    expect(
      createLoopSchema.safeParse({
        clips: [{ mediaId: 'm1', trimStartMs: 2000, trimEndMs: 1000 }],
        authenticity: 'edited',
      }).success,
    ).toBe(false);
    expect(
      createLoopSchema.safeParse({
        clips: [{ mediaId: 'm1', trimEndMs: 1000, speed: 4 }],
        authenticity: 'edited',
      }).success,
    ).toBe(false);
  });
});

describe('wellbeing and watch', () => {
  it('clamps watch heartbeats and budget range', () => {
    expect(watchLoopSchema.safeParse({ seconds: 5 }).success).toBe(true);
    expect(watchLoopSchema.safeParse({ seconds: 90 }).success).toBe(false);
    expect(wellbeingUpdateSchema.safeParse({ loopsBudgetMinutes: 30 }).success).toBe(true);
    expect(wellbeingUpdateSchema.safeParse({ loopsBudgetMinutes: null }).success).toBe(true);
    expect(wellbeingUpdateSchema.safeParse({ loopsBudgetMinutes: 2 }).success).toBe(false);
  });
});

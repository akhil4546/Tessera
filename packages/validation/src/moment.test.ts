import { describe, expect, it } from 'vitest';
import { createMomentSchema, keepMomentSchema, momentReactionSchema, momentStickerInputSchema } from './moment';

describe('createMomentSchema', () => {
  it('requires 1–20 segments with media ids', () => {
    expect(createMomentSchema.safeParse({ segments: [] }).success).toBe(false);
    expect(
      createMomentSchema.safeParse({
        segments: [{ mediaId: 'm1' }],
        visibility: 'public',
      }).success,
    ).toBe(true);
  });

  it('accepts a poll sticker and rejects a fifth option', () => {
    const ok = momentStickerInputSchema.safeParse({
      kind: 'poll',
      x: 0.5,
      y: 0.6,
      payload: { prompt: 'Clay or moss?', options: ['Clay', 'Moss'] },
    });
    expect(ok.success).toBe(true);
    expect(
      momentStickerInputSchema.safeParse({
        kind: 'poll',
        x: 0.5,
        y: 0.6,
        payload: { prompt: 'Too many', options: ['a', 'b', 'c', 'd', 'e'] },
      }).success,
    ).toBe(false);
  });
});

describe('keepMomentSchema', () => {
  it('needs a shelf or a new title', () => {
    expect(keepMomentSchema.safeParse({}).success).toBe(false);
    expect(keepMomentSchema.safeParse({ title: 'Studio light' }).success).toBe(true);
    expect(keepMomentSchema.safeParse({ shelfId: 's1' }).success).toBe(true);
  });
});

describe('momentReactionSchema', () => {
  it('only allows Tessera quick emojis, not a free-for-all', () => {
    expect(momentReactionSchema.safeParse({ emoji: '✨' }).success).toBe(true);
    expect(momentReactionSchema.safeParse({ emoji: '❤️' }).success).toBe(false);
  });
});

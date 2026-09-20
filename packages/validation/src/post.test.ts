import { describe, expect, it } from 'vitest';
import { createPostSchema, mediaIntentSchema } from './post';

describe('mediaIntentSchema', () => {
  it('rejects HEIC and oversized files', () => {
    expect(
      mediaIntentSchema.safeParse({ kind: 'image', mimeType: 'image/heic', byteSize: 1000 }).success,
    ).toBe(false);
    expect(
      mediaIntentSchema.safeParse({
        kind: 'image',
        mimeType: 'image/jpeg',
        byteSize: 50 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });

  it('accepts voice notes for messages only', () => {
    expect(
      mediaIntentSchema.safeParse({
        purpose: 'message',
        kind: 'audio',
        mimeType: 'audio/webm',
        byteSize: 1200,
      }).success,
    ).toBe(true);
    expect(
      mediaIntentSchema.safeParse({
        purpose: 'post',
        kind: 'audio',
        mimeType: 'audio/webm',
        byteSize: 1200,
      }).success,
    ).toBe(false);
  });
});

describe('createPostSchema', () => {
  it('requires authenticity and 1–10 media items', () => {
    expect(createPostSchema.safeParse({ media: [], authenticity: 'edited' }).success).toBe(false);
    expect(
      createPostSchema.safeParse({
        media: [{ id: 'm1' }],
        authenticity: 'unfiltered',
      }).success,
    ).toBe(true);
  });

  it('requires circleIds when the audience is Circles', () => {
    expect(
      createPostSchema.safeParse({
        media: [{ id: 'm1' }],
        authenticity: 'edited',
        audience: 'circles',
      }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({
        media: [{ id: 'm1' }],
        authenticity: 'edited',
        audience: 'circles',
        circleIds: ['c1'],
      }).success,
    ).toBe(true);
  });
});

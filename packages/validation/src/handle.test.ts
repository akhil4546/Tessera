import { describe, expect, it } from 'vitest';
import { handleSchema } from './handle';

describe('handleSchema', () => {
  it('accepts a typical handle', () => {
    expect(handleSchema.parse('asha_climbs')).toBe('asha_climbs');
  });

  it('rejects reserved words', () => {
    expect(handleSchema.safeParse('tessera').success).toBe(false);
    expect(handleSchema.safeParse('admin').success).toBe(false);
  });

  it('rejects short or numeric-only handles', () => {
    expect(handleSchema.safeParse('ab').success).toBe(false);
    expect(handleSchema.safeParse('12345').success).toBe(false);
  });
});

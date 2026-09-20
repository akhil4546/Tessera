import { describe, expect, it } from 'vitest';
import { parseCaption } from './caption.ts';

describe('parseCaption', () => {
  it('extracts unique hashtags and mentions', () => {
    const parsed = parseCaption('Granite at dawn with @Asha_climbs and @asha_climbs #Climb #climb #chalk');
    expect(parsed.mentions).toEqual(['asha_climbs']);
    expect(parsed.hashtags).toEqual(['climb', 'chalk']);
  });
});

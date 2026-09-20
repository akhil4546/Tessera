import { describe, expect, it } from 'vitest';
import { en } from './en';
import { NAV_MESSAGE_KEYS } from './keys';

function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, en);
}

describe('en catalog', () => {
  it('includes every navigation key', () => {
    for (const key of NAV_MESSAGE_KEYS) {
      const value = lookup(key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });
});

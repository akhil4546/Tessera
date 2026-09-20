import { describe, expect, it } from 'vitest';
import { duplicateBurst, urlHeavyNewAccount } from './spam.ts';

describe('spam heuristics', () => {
  it('flags a brand-new account dumping several links', () => {
    expect(
      urlHeavyNewAccount({
        accountAgeMs: 60 * 60 * 1000,
        body: 'see https://a.test https://b.test https://c.test',
      }),
    ).toBe(true);
  });

  it('does not flag an older account with the same body', () => {
    expect(
      urlHeavyNewAccount({
        accountAgeMs: 10 * 24 * 60 * 60 * 1000,
        body: 'see https://a.test https://b.test https://c.test',
      }),
    ).toBe(false);
  });

  it('flags a repeated identical comment burst', () => {
    expect(
      duplicateBurst({
        body: 'follow my shop',
        recentBodies: ['follow my shop', 'follow my shop', 'hello', 'follow my shop'],
      }),
    ).toBe(true);
  });
});

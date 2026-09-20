import { describe, expect, it } from 'vitest';
import { inspectRefreshSession } from './session.rules.js';

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

describe('inspectRefreshSession', () => {
  it('allows a live unused token', () => {
    expect(
      inspectRefreshSession({ revokedAt: null, replacedById: null, expiresAt: future }),
    ).toBe('ok');
  });

  it('detects rotation reuse', () => {
    expect(
      inspectRefreshSession({ revokedAt: null, replacedById: 'next', expiresAt: future }),
    ).toBe('reuse');
  });

  it('treats revoked and expired as dead', () => {
    expect(
      inspectRefreshSession({ revokedAt: new Date(), replacedById: null, expiresAt: future }),
    ).toBe('revoked');
    expect(
      inspectRefreshSession({ revokedAt: null, replacedById: null, expiresAt: past }),
    ).toBe('expired');
  });
});

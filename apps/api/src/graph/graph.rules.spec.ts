import { describe, expect, it } from 'vitest';
import { decideFollow } from './graph.rules.js';

describe('decideFollow', () => {
  it('creates an accepted follow on a public account', () => {
    expect(
      decideFollow({
        actorId: 'a',
        targetId: 'b',
        blockedEitherWay: false,
        targetPrivate: false,
        existingStatus: null,
      }),
    ).toEqual({ type: 'create', status: 'accepted' });
  });

  it('creates a pending request on a private account', () => {
    expect(
      decideFollow({
        actorId: 'a',
        targetId: 'b',
        blockedEitherWay: false,
        targetPrivate: true,
        existingStatus: null,
      }),
    ).toEqual({ type: 'create', status: 'pending' });
  });

  it('rejects self, blocks, and duplicates', () => {
    expect(
      decideFollow({
        actorId: 'a',
        targetId: 'a',
        blockedEitherWay: false,
        targetPrivate: false,
        existingStatus: null,
      }).type,
    ).toBe('error');
    expect(
      decideFollow({
        actorId: 'a',
        targetId: 'b',
        blockedEitherWay: true,
        targetPrivate: false,
        existingStatus: null,
      }),
    ).toEqual({ type: 'error', code: 'BLOCKED' });
    expect(
      decideFollow({
        actorId: 'a',
        targetId: 'b',
        blockedEitherWay: false,
        targetPrivate: false,
        existingStatus: 'accepted',
      }),
    ).toEqual({ type: 'error', code: 'ALREADY' });
  });
});

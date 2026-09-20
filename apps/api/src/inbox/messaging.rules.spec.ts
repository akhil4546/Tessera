import { describe, expect, it } from 'vitest';
import {
  canEditMessage,
  decideStartDirect,
  effectiveWhoCanMessage,
  groupOverCapacity,
  pairKey,
  readReceiptVisible,
} from './messaging.rules.js';

describe('pairKey', () => {
  it('orders ids so 1:1 lookup is unique', () => {
    expect(pairKey('b', 'a')).toEqual({ userLowId: 'a', userHighId: 'b' });
    expect(pairKey('a', 'b')).toEqual({ userLowId: 'a', userHighId: 'b' });
  });
});

describe('decideStartDirect', () => {
  const base = {
    actorId: 'asha',
    targetId: 'omar',
    blockedEitherWay: false,
    actorIsFollowerOfTarget: false,
    targetWhoCanMessage: 'everyone' as const,
    targetIsMinor: false,
  };

  it('turns a stranger into a request, not a live thread', () => {
    expect(decideStartDirect(base)).toEqual({ type: 'ok', request: true });
  });

  it('delivers to the inbox when the sender already follows', () => {
    expect(decideStartDirect({ ...base, actorIsFollowerOfTarget: true })).toEqual({ type: 'ok', request: false });
  });

  it('blocks non-followers of minors instead of creating a request', () => {
    expect(decideStartDirect({ ...base, targetIsMinor: true }).type).toBe('error');
    expect(decideStartDirect({ ...base, targetIsMinor: true, actorIsFollowerOfTarget: true })).toEqual({
      type: 'ok',
      request: false,
    });
  });

  it('honours whoCanMessage=nobody and blocks', () => {
    expect(decideStartDirect({ ...base, targetWhoCanMessage: 'nobody' })).toEqual({
      type: 'error',
      code: 'NOT_ALLOWED',
    });
    expect(decideStartDirect({ ...base, blockedEitherWay: true })).toEqual({ type: 'error', code: 'BLOCKED' });
    expect(decideStartDirect({ ...base, targetId: 'asha' })).toEqual({ type: 'error', code: 'SELF' });
  });
});

describe('canEditMessage', () => {
  it('allows text within 15 minutes from the sender', () => {
    const createdAt = new Date('2026-09-18T12:00:00.000Z');
    expect(
      canEditMessage({
        senderId: 'a',
        actorId: 'a',
        kind: 'text',
        createdAt,
        deletedAt: null,
        now: new Date('2026-09-18T12:10:00.000Z'),
      }),
    ).toBe(true);
    expect(
      canEditMessage({
        senderId: 'a',
        actorId: 'a',
        kind: 'text',
        createdAt,
        deletedAt: null,
        now: new Date('2026-09-18T12:16:00.000Z'),
      }),
    ).toBe(false);
    expect(
      canEditMessage({
        senderId: 'a',
        actorId: 'b',
        kind: 'text',
        createdAt,
        deletedAt: null,
        now: new Date('2026-09-18T12:01:00.000Z'),
      }),
    ).toBe(false);
  });
});

describe('groupOverCapacity / receipts / minors', () => {
  it('caps groups at 32 and hides read receipts when disabled', () => {
    expect(groupOverCapacity(31, 1)).toBe(false);
    expect(groupOverCapacity(31, 2)).toBe(true);
    expect(readReceiptVisible({ readerId: 'b', senderId: 'a', readerReceiptsEnabled: false })).toBe(false);
    expect(readReceiptVisible({ readerId: 'b', senderId: 'a', readerReceiptsEnabled: true })).toBe(true);
    expect(effectiveWhoCanMessage({ whoCanMessage: 'everyone', isMinor: true })).toBe('followers');
  });
});

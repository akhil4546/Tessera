import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_PENDING_STATUS,
  IDEMPOTENCY_PENDING_TTL_MS,
  IDEMPOTENCY_TTL_MS,
} from '@tessera/media';
import {
  classifyRecord,
  hashIdempotencyBody,
  idempotencyRoute,
  readIdempotencyKey,
} from './idempotency.js';

describe('idempotency helpers', () => {
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('hashes object keys in a stable order and raw bytes separately', () => {
    expect(hashIdempotencyBody({ b: 1, a: { d: true, c: 'x' } })).toBe(
      hashIdempotencyBody({ a: { c: 'x', d: true }, b: 1 }),
    );
    expect(hashIdempotencyBody({ name: 'Close' })).not.toBe(hashIdempotencyBody({ name: 'Other' }));
    expect(hashIdempotencyBody(Buffer.from('frame'))).not.toBe(hashIdempotencyBody('frame'));
    expect(hashIdempotencyBody(undefined)).toBe(hashIdempotencyBody(null));
  });

  it('reads a single-line key and rejects arrays, blanks, and overlong values', () => {
    expect(readIdempotencyKey(undefined)).toBeNull();
    expect(readIdempotencyKey('  ')).toBeNull();
    expect(readIdempotencyKey('  circle-1  ')).toBe('circle-1');
    expect(readIdempotencyKey(['a', 'b'])).toBe('invalid');
    expect(readIdempotencyKey(`line\nbreak`)).toBe('invalid');
    expect(readIdempotencyKey('k'.repeat(256))).toBe('invalid');
    expect(readIdempotencyKey('k'.repeat(255))).toBe('k'.repeat(255));
  });

  it('keys the route by method, path, and sorted query', () => {
    expect(idempotencyRoute('post', '/v1/me/circles')).toBe('POST /v1/me/circles');
    expect(idempotencyRoute('POST', '/v1/boards?x=1', { b: '2', a: ['z', 'm'] })).toBe(
      'POST /v1/boards?a=m&a=z&b=2',
    );
  });

  it('replays a matching body, rejects a different one, and expires locks', () => {
    const hash = hashIdempotencyBody({ name: 'Close' });
    const done = {
      status: 201,
      createdAt: now,
      body: { v: 1, hash, response: { id: 'c1', name: 'Close' } },
    };
    expect(classifyRecord(done, hash, now)).toEqual({
      kind: 'replay',
      body: { id: 'c1', name: 'Close' },
    });
    expect(classifyRecord(done, hashIdempotencyBody({ name: 'Other' }), now).kind).toBe('mismatch');
    expect(
      classifyRecord(
        { ...done, createdAt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) },
        hash,
        now,
      ).kind,
    ).toBe('expired');

    const pending = {
      status: IDEMPOTENCY_PENDING_STATUS,
      createdAt: now,
      body: { v: 1, hash, response: null },
    };
    expect(classifyRecord(pending, hash, now).kind).toBe('pending');
    expect(classifyRecord(pending, hashIdempotencyBody({ name: 'Other' }), now).kind).toBe(
      'mismatch',
    );
    expect(
      classifyRecord(
        { ...pending, createdAt: new Date(now.getTime() - IDEMPOTENCY_PENDING_TTL_MS) },
        hash,
        now,
      ).kind,
    ).toBe('expired');
    expect(
      classifyRecord({ status: 201, createdAt: now, body: 'legacy-post-id' }, hash, now).kind,
    ).toBe('legacy');
  });
});

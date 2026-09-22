import { describe, expect, it } from 'vitest';
import { fsMediaUrl, signFsMediaUrl, verifyFsMediaToken } from './fs-media-url.js';

const env = { JWT_ACCESS_SECRET: 'test-jwt-access-secret-32-chars-min' } as NodeJS.ProcessEnv;
const nowMs = 1_700_000_000_000;

function parts(url: string): { key: string; exp: string; sig: string } {
  const parsed = new URL(url, 'http://localhost');
  return {
    key: decodeURIComponent(parsed.pathname.slice('/v1/media/file/'.length)),
    exp: parsed.searchParams.get('exp') ?? '',
    sig: parsed.searchParams.get('sig') ?? '',
  };
}

describe('filesystem media URLs', () => {
  it('round-trips a key that contains slashes', () => {
    const key = 'post/user/id/w640.webp';
    const url = signFsMediaUrl(key, 60, nowMs, env);
    const token = parts(url);
    expect(token.key).toBe(key);
    expect(verifyFsMediaToken(token.key, token.exp, token.sig, nowMs, env)).toEqual({
      ok: true,
      exp: Number(token.exp),
    });
  });

  it('rejects a missing token, a tampered signature, and a signature for a different key', () => {
    const url = signFsMediaUrl('post/a.jpg', 60, nowMs, env);
    const token = parts(url);
    expect(verifyFsMediaToken(token.key, undefined, undefined, nowMs, env).ok).toBe(false);
    expect(verifyFsMediaToken(token.key, token.exp, `${token.sig}x`, nowMs, env).ok).toBe(false);
    expect(verifyFsMediaToken('post/b.jpg', token.exp, token.sig, nowMs, env).ok).toBe(false);
  });

  it('rejects an expired token and a token at the exact expiry second', () => {
    const url = signFsMediaUrl('post/a.jpg', 60, nowMs, env);
    const token = parts(url);
    const exp = Number(token.exp);
    expect(verifyFsMediaToken(token.key, token.exp, token.sig, exp * 1000, env).ok).toBe(false);
    expect(verifyFsMediaToken(token.key, token.exp, token.sig, exp * 1000 - 1000, env).ok).toBe(true);
  });

  it('does not treat key+exp concatenation as the signed message', () => {
    const url = fsMediaUrl('photo/a', 2_000_000_012, env);
    const token = parts(url);
    expect(verifyFsMediaToken('photo/a200000001', '2', token.sig, nowMs, env).ok).toBe(false);
    expect(verifyFsMediaToken('photo/a', token.exp, token.sig, nowMs, env).ok).toBe(true);
  });
});

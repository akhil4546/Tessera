import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Filesystem media URLs are HMAC'd with JWT_ACCESS_SECRET.
 * `${exp}.${key}` keeps the pair unambiguous: exp is digits, so the first dot
 * is the boundary. Plain `key + exp` collides (`a`+`12` vs `a1`+`2`).
 * Rotating JWT_ACCESS_SECRET invalidates outstanding filesystem media URLs.
 * JWT_ACCESS_SECRET_PREVIOUS is not accepted here.
 */
function signingSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is required to sign filesystem media URLs.');
  }
  return secret;
}

function mediaMac(key: string, exp: number, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', signingSecret(env)).update(`${exp}.${key}`).digest('base64url');
}

export function fsMediaUrl(key: string, exp: number, env: NodeJS.ProcessEnv = process.env): string {
  if (!Number.isSafeInteger(exp) || exp < 0) {
    throw new Error('Media URL expiry must be a non-negative integer.');
  }
  const sig = mediaMac(key, exp, env);
  return `/v1/media/file/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
}

export function signFsMediaUrl(
  key: string,
  expiresSeconds: number,
  nowMs = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!Number.isFinite(expiresSeconds) || expiresSeconds < 1) {
    throw new Error('expiresSeconds must be at least 1.');
  }
  const exp = Math.floor(nowMs / 1000) + Math.floor(expiresSeconds);
  return fsMediaUrl(key, exp, env);
}

export function verifyFsMediaToken(
  key: string,
  expRaw: unknown,
  sigRaw: unknown,
  nowMs = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; exp: number } | { ok: false } {
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') return { ok: false };
  if (!/^[0-9]{1,12}$/.test(expRaw)) return { ok: false };
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp)) return { ok: false };
  const expected = mediaMac(key, exp, env);
  const left = Buffer.from(sigRaw);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false };
  if (exp <= Math.floor(nowMs / 1000)) return { ok: false };
  return { ok: true, exp };
}

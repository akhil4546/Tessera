import { Injectable } from '@nestjs/common';
import { decodeProtectedHeader, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { ACCESS_TTL_SECONDS } from '../common/cookies.js';
import { TesseraHttpError } from '../common/http-error.js';
import { assertJwtSecrets, loadJwtKey, type JwtKey } from './jwt-secrets.js';

export type AccessPayload = {
  sub: string;
  sid: string;
  hdl: string;
};

export type AdminAccessPayload = {
  sub: string;
  sid: string;
  eml: string;
  role: 'moderator' | 'admin' | 'superadmin';
};

export type ChallengePayload = {
  sub: string;
  purpose: '2fa';
};

export type OauthStatePayload = {
  purpose: 'oauth';
  provider: 'google' | 'apple';
  client: 'web' | 'mobile';
};

export type OauthSetupPayload = {
  purpose: 'oauth-setup';
  provider: 'google' | 'apple';
  providerAccountId: string;
  email: string;
  name: string;
};

type SecretFamily = 'access' | 'admin' | 'purpose';

const FAMILY_ENV: Record<SecretFamily, { current: string; previous: string }> = {
  access: { current: 'JWT_ACCESS_SECRET', previous: 'JWT_ACCESS_SECRET_PREVIOUS' },
  admin: { current: 'JWT_ADMIN_SECRET', previous: 'JWT_ADMIN_SECRET_PREVIOUS' },
  purpose: { current: 'JWT_PURPOSE_SECRET', previous: 'JWT_PURPOSE_SECRET_PREVIOUS' },
};

function keysFor(family: SecretFamily): { current: JwtKey; previous: JwtKey | null } {
  const names = FAMILY_ENV[family];
  return {
    current: loadJwtKey(process.env, names.current, true),
    previous: loadJwtKey(process.env, names.previous, false),
  };
}

function isSecretConfigError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('must be at least 32') || error.message.includes('must be different'))
  );
}

function keysForKid(kid: unknown, current: JwtKey, previous: JwtKey | null): JwtKey[] {
  if (kid === undefined) {
    return previous && previous.kid !== current.kid ? [current, previous] : [current];
  }
  if (typeof kid !== 'string' || kid.length === 0) throw new Error('kid');
  if (kid === current.kid) return [current];
  if (previous && kid === previous.kid) return [previous];
  throw new Error('kid');
}

async function signJwt(
  payload: JWTPayload,
  family: SecretFamily,
  issuer: string,
  expiration: string,
): Promise<string> {
  const { current } = keysFor(family);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', kid: current.kid })
    .setIssuedAt()
    .setExpirationTime(expiration)
    .setIssuer(issuer)
    .sign(current.key);
}

async function verifyJwt(token: string, family: SecretFamily, issuer: string): Promise<JWTPayload> {
  const { current, previous } = keysFor(family);
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'HS256') throw new Error('alg');
  const candidates = keysForKid(header.kid, current, previous);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const { payload } = await jwtVerify(token, candidate.key, {
        issuer,
        algorithms: ['HS256'],
      });
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('verify');
}

function rejectAs(error: unknown, status: number, code: string, message: string): never {
  if (isSecretConfigError(error)) throw error;
  throw new TesseraHttpError(status, code, message);
}

@Injectable()
export class TokenService {
  constructor() {
    assertJwtSecrets(process.env);
  }

  async signAccess(payload: AccessPayload): Promise<string> {
    return signJwt(payload, 'access', 'tessera', `${ACCESS_TTL_SECONDS}s`);
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      const payload = await verifyJwt(token, 'access', 'tessera');
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.hdl !== 'string'
      ) {
        throw new Error('bad payload');
      }
      return { sub: payload.sub, sid: payload.sid, hdl: payload.hdl };
    } catch (error) {
      rejectAs(error, 401, 'UNAUTHENTICATED', 'Sign in again.');
    }
  }

  async signChallenge(userId: string): Promise<string> {
    return signJwt({ sub: userId, purpose: '2fa' }, 'purpose', 'tessera', '5m');
  }

  async verifyChallenge(token: string): Promise<string> {
    try {
      const payload = await verifyJwt(token, 'purpose', 'tessera');
      if (payload.purpose !== '2fa' || typeof payload.sub !== 'string') throw new Error('bad');
      return payload.sub;
    } catch (error) {
      rejectAs(error, 401, 'UNAUTHENTICATED', 'That two-factor challenge expired. Sign in again.');
    }
  }

  async signOauthState(payload: OauthStatePayload): Promise<string> {
    return signJwt(payload, 'purpose', 'tessera', '10m');
  }

  async verifyOauthState(token: string): Promise<OauthStatePayload> {
    try {
      const payload = await verifyJwt(token, 'purpose', 'tessera');
      if (
        payload.purpose !== 'oauth' ||
        (payload.provider !== 'google' && payload.provider !== 'apple') ||
        (payload.client !== 'web' && payload.client !== 'mobile')
      ) {
        throw new Error('bad');
      }
      return { purpose: 'oauth', provider: payload.provider, client: payload.client };
    } catch (error) {
      rejectAs(error, 400, 'OAUTH_STATE', 'OAuth state is invalid or expired.');
    }
  }

  async signOauthSetup(payload: OauthSetupPayload): Promise<string> {
    return signJwt(payload, 'purpose', 'tessera', '15m');
  }

  async verifyOauthSetup(token: string): Promise<OauthSetupPayload> {
    try {
      const payload = await verifyJwt(token, 'purpose', 'tessera');
      if (
        payload.purpose !== 'oauth-setup' ||
        (payload.provider !== 'google' && payload.provider !== 'apple') ||
        typeof payload.providerAccountId !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.name !== 'string'
      ) {
        throw new Error('bad');
      }
      return {
        purpose: 'oauth-setup',
        provider: payload.provider,
        providerAccountId: payload.providerAccountId,
        email: payload.email,
        name: payload.name,
      };
    } catch (error) {
      rejectAs(
        error,
        401,
        'OAUTH_SETUP',
        'That sign-in expired. Start again from Google or Apple.',
      );
    }
  }

  async signAdminAccess(payload: AdminAccessPayload): Promise<string> {
    return signJwt(payload, 'admin', 'tessera-admin', `${ACCESS_TTL_SECONDS}s`);
  }

  async verifyAdminAccess(token: string): Promise<AdminAccessPayload> {
    try {
      const payload = await verifyJwt(token, 'admin', 'tessera-admin');
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.eml !== 'string' ||
        (payload.role !== 'moderator' && payload.role !== 'admin' && payload.role !== 'superadmin')
      ) {
        throw new Error('bad payload');
      }
      return { sub: payload.sub, sid: payload.sid, eml: payload.eml, role: payload.role };
    } catch (error) {
      rejectAs(error, 401, 'UNAUTHENTICATED', 'Sign in to the admin app again.');
    }
  }
}

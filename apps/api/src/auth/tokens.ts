import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { ACCESS_TTL_SECONDS } from '../common/cookies.js';
import { TesseraHttpError } from '../common/http-error.js';

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

function secretKey(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

@Injectable()
export class TokenService {
  async signAccess(payload: AccessPayload): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .setIssuer('tessera')
      .sign(secretKey());
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { issuer: 'tessera' });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.hdl !== 'string') {
        throw new Error('bad payload');
      }
      return { sub: payload.sub, sid: payload.sid, hdl: payload.hdl };
    } catch {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in again.');
    }
  }

  async signChallenge(userId: string): Promise<string> {
    return new SignJWT({ sub: userId, purpose: '2fa' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('tessera')
      .sign(secretKey());
  }

  async verifyChallenge(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { issuer: 'tessera' });
      if (payload.purpose !== '2fa' || typeof payload.sub !== 'string') throw new Error('bad');
      return payload.sub;
    } catch {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'That two-factor challenge expired. Sign in again.');
    }
  }

  async signOauthState(payload: OauthStatePayload): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer('tessera')
      .sign(secretKey());
  }

  async verifyOauthState(token: string): Promise<OauthStatePayload> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { issuer: 'tessera' });
      if (
        payload.purpose !== 'oauth' ||
        (payload.provider !== 'google' && payload.provider !== 'apple') ||
        (payload.client !== 'web' && payload.client !== 'mobile')
      ) {
        throw new Error('bad');
      }
      return { purpose: 'oauth', provider: payload.provider, client: payload.client };
    } catch {
      throw new TesseraHttpError(400, 'OAUTH_STATE', 'OAuth state is invalid or expired.');
    }
  }

  async signOauthSetup(payload: OauthSetupPayload): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setIssuer('tessera')
      .sign(secretKey());
  }

  async signAdminAccess(payload: AdminAccessPayload): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .setIssuer('tessera-admin')
      .sign(secretKey());
  }

  async verifyAdminAccess(token: string): Promise<AdminAccessPayload> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { issuer: 'tessera-admin' });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.eml !== 'string' ||
        (payload.role !== 'moderator' && payload.role !== 'admin' && payload.role !== 'superadmin')
      ) {
        throw new Error('bad payload');
      }
      return { sub: payload.sub, sid: payload.sid, eml: payload.eml, role: payload.role };
    } catch {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app again.');
    }
  }

  async verifyOauthSetup(token: string): Promise<OauthSetupPayload> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { issuer: 'tessera' });
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
    } catch {
      throw new TesseraHttpError(401, 'OAUTH_SETUP', 'That sign-in expired. Start again from Google or Apple.');
    }
  }
}

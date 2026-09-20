import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { TesseraHttpError } from '../common/http-error.js';
import { apiPublicUrl } from '../common/origins.js';

export type OauthProfile = {
  provider: 'google' | 'apple';
  providerAccountId: string;
  email: string;
  name: string;
};

function notConfigured(provider: string): TesseraHttpError {
  return new TesseraHttpError(
    501,
    'OAUTH_NOT_CONFIGURED',
    `${provider} sign-in is implemented but not configured. Set the ${provider} OAuth env vars.`,
  );
}

export function assertGoogleConfigured(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw notConfigured('Google');
  return { clientId, clientSecret };
}

export function assertAppleConfigured(): {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
} {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) throw notConfigured('Apple');
  return { clientId, teamId, keyId, privateKey };
}

export function googleRedirectUri(): string {
  return `${apiPublicUrl()}/v1/auth/google/callback`;
}

export function appleRedirectUri(): string {
  return `${apiPublicUrl()}/v1/auth/apple/callback`;
}

export function googleAuthorizeUrl(state: string): string {
  const { clientId } = assertGoogleConfigured();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function appleAuthorizeUrl(state: string): string {
  const { clientId } = assertAppleConfigured();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: appleRedirectUri(),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<OauthProfile> {
  const { clientId, clientSecret } = assertGoogleConfigured();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Google sign-in failed.');
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Google sign-in failed.');
  }
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Google sign-in failed.');
  }
  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified === false) {
    throw new TesseraHttpError(400, 'OAUTH_EMAIL', 'Google did not provide a verified email.');
  }
  return {
    provider: 'google',
    providerAccountId: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name?.trim() || profile.email.split('@')[0] || 'Member',
  };
}

async function appleClientSecret(): Promise<string> {
  const { clientId, teamId, keyId, privateKey } = assertAppleConfigured();
  const pk = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(pk);
}

export async function exchangeAppleCode(code: string): Promise<OauthProfile> {
  const { clientId } = assertAppleConfigured();
  const secret = await appleClientSecret();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: appleRedirectUri(),
    client_id: clientId,
    client_secret: secret,
  });
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Apple sign-in failed.');
  }
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Apple sign-in failed.');
  }
  const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    audience: clientId,
    issuer: 'https://appleid.apple.com',
  });
  const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
  if (!sub) {
    throw new TesseraHttpError(401, 'OAUTH_FAILED', 'Apple sign-in failed.');
  }
  if (!email) {
    throw new TesseraHttpError(
      400,
      'OAUTH_EMAIL',
      'Apple did not share an email. Use an Apple ID that includes email, or sign up with email.',
    );
  }
  return {
    provider: 'apple',
    providerAccountId: sub,
    email,
    name: email.split('@')[0] || 'Member',
  };
}

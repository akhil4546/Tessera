import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeProtectedHeader, SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { kidForSecret } from './jwt-secrets.js';
import { TokenService } from './tokens.js';

const ACCESS = 'test-jwt-access-secret-32-chars-min';
const ADMIN = 'test-jwt-admin-secret-32-characters-long';
const PURPOSE = 'test-jwt-purpose-secret-32-characters-long';
const PREVIOUS_ACCESS = 'previous-access-secret-32-characters-long';

process.env.JWT_ACCESS_SECRET ??= ACCESS;
process.env.JWT_ADMIN_SECRET ??= ADMIN;
process.env.JWT_PURPOSE_SECRET ??= PURPOSE;

const savedEnv = new Map<string, string | undefined>();

function expectedKid(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

function encode(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function signed(
  payload: Record<string, unknown>,
  secret: string,
  issuer: string,
  kid?: string,
): Promise<string> {
  const header = kid ? { alg: 'HS256' as const, kid } : { alg: 'HS256' as const };
  return new SignJWT(payload)
    .setProtectedHeader(header)
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer(issuer)
    .sign(encode(secret));
}

describe('token signing keys', () => {
  const tokens = new TokenService();

  afterEach(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    savedEnv.clear();
  });

  function useEnv(patch: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it('rejects an admin token signed with the user access secret', async () => {
    const forged = await signed(
      { sub: 'staff-1', sid: 'admin-sid', eml: 'staff@example.com', role: 'admin' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera-admin',
    );
    await expect(tokens.verifyAdminAccess(forged)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a two-factor challenge signed with the user access secret', async () => {
    const forged = await signed(
      { sub: 'user-1', purpose: '2fa' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
    );
    await expect(tokens.verifyChallenge(forged)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects an OAuth state token signed with the user access secret', async () => {
    const forged = await signed(
      { purpose: 'oauth', provider: 'google', client: 'web' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
    );
    await expect(tokens.verifyOauthState(forged)).rejects.toMatchObject({ code: 'OAUTH_STATE' });
  });

  it('rejects an OAuth setup token signed with the user access secret', async () => {
    const forged = await signed(
      {
        purpose: 'oauth-setup',
        provider: 'apple',
        providerAccountId: 'apple-1',
        email: 'ada@example.com',
        name: 'Ada',
      },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
    );
    await expect(tokens.verifyOauthSetup(forged)).rejects.toMatchObject({ code: 'OAUTH_SETUP' });
  });

  it('puts the admin secret kid on admin tokens and will not accept them as user tokens', async () => {
    const token = await tokens.signAdminAccess({
      sub: 'staff-1',
      sid: 'admin-sid',
      eml: 'staff@example.com',
      role: 'moderator',
    });
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('HS256');
    expect(header.kid).toBe(kidForSecret(process.env.JWT_ADMIN_SECRET!));
    expect(header.kid).not.toBe(kidForSecret(process.env.JWT_ACCESS_SECRET!));
    await expect(tokens.verifyAdminAccess(token)).resolves.toMatchObject({
      sub: 'staff-1',
      role: 'moderator',
    });
    await expect(tokens.verifyAccess(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('signs purpose tokens with the purpose secret, not the access secret', async () => {
    const challenge = await tokens.signChallenge('user-1');
    const state = await tokens.signOauthState({
      purpose: 'oauth',
      provider: 'google',
      client: 'mobile',
    });
    const setup = await tokens.signOauthSetup({
      purpose: 'oauth-setup',
      provider: 'google',
      providerAccountId: 'google-1',
      email: 'ada@example.com',
      name: 'Ada',
    });
    for (const token of [challenge, state, setup]) {
      const header = decodeProtectedHeader(token);
      expect(header.kid).toBe(kidForSecret(process.env.JWT_PURPOSE_SECRET!));
      expect(header.kid).not.toBe(kidForSecret(process.env.JWT_ACCESS_SECRET!));
    }
    await expect(tokens.verifyChallenge(challenge)).resolves.toBe('user-1');
    await expect(tokens.verifyOauthState(state)).resolves.toMatchObject({ client: 'mobile' });
    await expect(tokens.verifyOauthSetup(setup)).resolves.toMatchObject({
      providerAccountId: 'google-1',
    });
    await expect(tokens.verifyAccess(challenge)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(tokens.verifyChallenge(state)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(tokens.verifyOauthSetup(state)).rejects.toMatchObject({ code: 'OAUTH_SETUP' });
  });

  it('accepts a purpose-secret challenge and rejects an access token presented as one', async () => {
    const challenge = await signed(
      { sub: 'user-1', purpose: '2fa' },
      process.env.JWT_PURPOSE_SECRET!,
      'tessera',
      kidForSecret(process.env.JWT_PURPOSE_SECRET!),
    );
    await expect(tokens.verifyChallenge(challenge)).resolves.toBe('user-1');

    const access = await tokens.signAccess({ sub: 'user-1', sid: 'sid-1', hdl: 'ada' });
    await expect(tokens.verifyAccess(access)).resolves.toMatchObject({ hdl: 'ada' });
    await expect(tokens.verifyChallenge(access)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(tokens.verifyAdminAccess(access)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('still accepts a current access token that has no kid', async () => {
    const legacy = await signed(
      { sub: 'user-1', sid: 'sid-1', hdl: 'ada' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
    );
    await expect(tokens.verifyAccess(legacy)).resolves.toEqual({
      sub: 'user-1',
      sid: 'sid-1',
      hdl: 'ada',
    });
  });

  it('rejects an access token whose kid names neither the current nor the previous key', async () => {
    const token = await signed(
      { sub: 'user-1', sid: 'sid-1', hdl: 'ada' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
      'not-a-real-key-id',
    );
    await expect(tokens.verifyAccess(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('does not accept a current-key signature presented with the previous kid', async () => {
    useEnv({ JWT_ACCESS_SECRET_PREVIOUS: PREVIOUS_ACCESS });
    const token = await signed(
      { sub: 'user-1', sid: 'sid-1', hdl: 'ada' },
      process.env.JWT_ACCESS_SECRET!,
      'tessera',
      kidForSecret(PREVIOUS_ACCESS),
    );
    await expect(tokens.verifyAccess(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('verifies tokens signed with the previous access secret, then stops when that secret is removed', async () => {
    useEnv({ JWT_ACCESS_SECRET_PREVIOUS: PREVIOUS_ACCESS });
    const withKid = await signed(
      { sub: 'user-1', sid: 'sid-1', hdl: 'ada' },
      PREVIOUS_ACCESS,
      'tessera',
      kidForSecret(PREVIOUS_ACCESS),
    );
    const withoutKid = await signed(
      { sub: 'user-2', sid: 'sid-2', hdl: 'beau' },
      PREVIOUS_ACCESS,
      'tessera',
    );
    await expect(tokens.verifyAccess(withKid)).resolves.toMatchObject({ sub: 'user-1' });
    await expect(tokens.verifyAccess(withoutKid)).resolves.toMatchObject({ sub: 'user-2' });

    delete process.env.JWT_ACCESS_SECRET_PREVIOUS;
    await expect(tokens.verifyAccess(withKid)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(tokens.verifyAccess(withoutKid)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('keeps accepting the current key while the previous key is also configured', async () => {
    useEnv({ JWT_ACCESS_SECRET_PREVIOUS: PREVIOUS_ACCESS });
    const token = await tokens.signAccess({ sub: 'user-1', sid: 'sid-1', hdl: 'ada' });
    expect(decodeProtectedHeader(token).kid).toBe(kidForSecret(process.env.JWT_ACCESS_SECRET!));
    await expect(tokens.verifyAccess(token)).resolves.toMatchObject({ hdl: 'ada' });
  });

  it('fails at construction when a required secret is missing', () => {
    useEnv({ JWT_ADMIN_SECRET: undefined });
    expect(() => new TokenService()).toThrow(/JWT_ADMIN_SECRET must be at least 32 characters/);
  });

  it('fails at construction when a required secret is shorter than 32 characters', () => {
    useEnv({ JWT_PURPOSE_SECRET: 'too-short' });
    expect(() => new TokenService()).toThrow(/JWT_PURPOSE_SECRET must be at least 32 characters/);
  });

  it('fails at construction when the three signing secrets are not distinct', () => {
    useEnv({ JWT_ADMIN_SECRET: process.env.JWT_ACCESS_SECRET });
    expect(() => new TokenService()).toThrow(/must be different/);
  });

  it('fails at construction when a previous secret is set but shorter than 32 characters', () => {
    useEnv({ JWT_ADMIN_SECRET_PREVIOUS: 'short' });
    expect(() => new TokenService()).toThrow(
      /JWT_ADMIN_SECRET_PREVIOUS must be at least 32 characters/,
    );
  });

  it('allows a blank previous secret', () => {
    useEnv({ JWT_PURPOSE_SECRET_PREVIOUS: '' });
    expect(() => new TokenService()).not.toThrow();
  });

  it('accepts the previous admin and purpose secrets during a rotation', async () => {
    const previousAdmin = 'previous-admin-secret-32-characters-long';
    const previousPurpose = 'previous-purpose-secret-32-characters-long';
    useEnv({
      JWT_ADMIN_SECRET_PREVIOUS: previousAdmin,
      JWT_PURPOSE_SECRET_PREVIOUS: previousPurpose,
    });
    const admin = await signed(
      { sub: 'staff-1', sid: 'admin-sid', eml: 'staff@example.com', role: 'superadmin' },
      previousAdmin,
      'tessera-admin',
      kidForSecret(previousAdmin),
    );
    const challenge = await signed(
      { sub: 'user-9', purpose: '2fa' },
      previousPurpose,
      'tessera',
      kidForSecret(previousPurpose),
    );
    await expect(tokens.verifyAdminAccess(admin)).resolves.toMatchObject({ role: 'superadmin' });
    await expect(tokens.verifyChallenge(challenge)).resolves.toBe('user-9');
  });

  it('derives kid from the first 16 hex characters of SHA-256 of the secret', () => {
    const secret = 'a'.repeat(32);
    expect(kidForSecret(secret)).toBe(expectedKid(secret));
    expect(kidForSecret(secret)).toHaveLength(16);
  });

  it('checks signing secrets before the API listens', () => {
    const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const check = source.indexOf('assertJwtSecrets(process.env)');
    const listen = source.indexOf('app.listen');
    expect(check).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(check);
  });
});

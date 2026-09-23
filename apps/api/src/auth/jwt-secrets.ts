import { createHash } from 'node:crypto';

/** First 16 hex characters of SHA-256(secret). Rotation does not need a separate key id. */
export function kidForSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

export type JwtKey = {
  kid: string;
  key: Uint8Array;
};

const MIN_SECRET_LENGTH = 32;

const REQUIRED_SECRETS = ['JWT_ACCESS_SECRET', 'JWT_ADMIN_SECRET', 'JWT_PURPOSE_SECRET'] as const;

const PREVIOUS_SECRETS = [
  'JWT_ACCESS_SECRET_PREVIOUS',
  'JWT_ADMIN_SECRET_PREVIOUS',
  'JWT_PURPOSE_SECRET_PREVIOUS',
] as const;

function tooShort(name: string): string {
  return `${name} must be at least 32 characters.`;
}

function readSecret(env: NodeJS.ProcessEnv, name: string, required: boolean): string | null {
  const secret = env[name];
  if (secret === undefined || secret === '') {
    if (required) throw new Error(tooShort(name));
    return null;
  }
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(tooShort(name));
  return secret;
}

/**
 * User access, admin access, and short-lived purpose tokens (2FA, OAuth state, OAuth setup)
 * each have their own secret. Called at process boot, before the server listens.
 * Optional `*_PREVIOUS` secrets verify tokens signed before a rotation. Drop them after
 * the access TTL (15 minutes). Filesystem media URLs use only the current access secret.
 */
export function assertJwtSecrets(env: NodeJS.ProcessEnv): void {
  const values = REQUIRED_SECRETS.map((name) => readSecret(env, name, true) as string);
  if (new Set(values).size !== values.length) {
    throw new Error(
      'JWT_ACCESS_SECRET, JWT_ADMIN_SECRET, and JWT_PURPOSE_SECRET must be different secrets.',
    );
  }
  for (const name of PREVIOUS_SECRETS) readSecret(env, name, false);
}

export function loadJwtKey(env: NodeJS.ProcessEnv, name: string, required: true): JwtKey;
export function loadJwtKey(env: NodeJS.ProcessEnv, name: string, required: false): JwtKey | null;
export function loadJwtKey(env: NodeJS.ProcessEnv, name: string, required: boolean): JwtKey | null {
  const secret = readSecret(env, name, required);
  if (!secret) return null;
  return { kid: kidForSecret(secret), key: new TextEncoder().encode(secret) };
}

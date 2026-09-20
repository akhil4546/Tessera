import { afterEach, describe, expect, it } from 'vitest';
import { TesseraHttpError } from '../common/http-error.js';
import { assertAppleConfigured, assertGoogleConfigured } from './oauth.js';

describe('oauth configuration', () => {
  const keys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
  ] as const;
  const snapshot = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('labels Google as not configured when env is missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      assertGoogleConfigured();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TesseraHttpError);
      expect((err as TesseraHttpError).code).toBe('OAUTH_NOT_CONFIGURED');
    }
  });

  it('labels Apple as not configured when env is missing', () => {
    delete process.env.APPLE_CLIENT_ID;
    try {
      assertAppleConfigured();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TesseraHttpError);
      expect((err as TesseraHttpError).code).toBe('OAUTH_NOT_CONFIGURED');
    }
  });
});

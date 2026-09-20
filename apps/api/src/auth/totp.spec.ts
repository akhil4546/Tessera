import { describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';
import { generateTotpSecret, verifyTotp } from './totp.js';

describe('TOTP', () => {
  it('round-trips a current code', () => {
    const { secret, encrypted } = generateTotpSecret();
    const code = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate();
    expect(verifyTotp(encrypted, code)).toBe(true);
    expect(verifyTotp(encrypted, '000000')).toBe(false);
  });
});

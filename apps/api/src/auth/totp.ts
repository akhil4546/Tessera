import * as OTPAuth from 'otpauth';
import { decryptString, encryptString } from '../common/crypto.js';

export function generateTotpSecret(): { secret: string; encrypted: string; otpauthUrl: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'Tessera',
    label: 'Tessera',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  const secret = totp.secret.base32;
  return {
    secret,
    encrypted: encryptString(secret),
    otpauthUrl: totp.toString(),
  };
}

export function totpOtpauthUrl(secret: string, handle: string): string {
  return new OTPAuth.TOTP({
    issuer: 'Tessera',
    label: handle,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

export function verifyTotp(encryptedSecret: string, code: string): boolean {
  const secret = decryptString(encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: 'Tessera',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateTotpSecretForTests(): { secret: string; encrypted: string } {
  const generated = generateTotpSecret();
  return { secret: generated.secret, encrypted: generated.encrypted };
}

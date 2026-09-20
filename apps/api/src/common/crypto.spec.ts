import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, hashPassword, verifyPassword } from './crypto.js';

describe('crypto helpers', () => {
  it('encrypts and decrypts a TOTP secret', () => {
    const packed = encryptString('JBSWY3DPEHPK3PXP');
    expect(decryptString(packed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('hashes a password with argon2id', async () => {
    const hash = await hashPassword('Seedpass1!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'Seedpass1!')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-pass1')).resolves.toBe(false);
  });
});

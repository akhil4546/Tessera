import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, registerSchema } from './auth';

describe('passwordSchema', () => {
  it('accepts a mixed password of 10+ characters', () => {
    expect(passwordSchema.parse('Seedpass1!')).toBe('Seedpass1!');
  });

  it('rejects short or letter-only passwords', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('lettersonly').success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('lowercases email and handle', () => {
    const parsed = registerSchema.parse({
      email: 'Asha@Tessera.test',
      password: 'Seedpass1!',
      handle: 'Asha_Climbs',
      displayName: 'Asha',
      dateOfBirth: '1994-03-12',
    });
    expect(parsed.email).toBe('asha@tessera.test');
    expect(parsed.handle).toBe('asha_climbs');
  });

  it('rejects reserved handles', () => {
    const result = registerSchema.safeParse({
      email: 'x@tessera.test',
      password: 'Seedpass1!',
      handle: 'admin',
      displayName: 'X',
      dateOfBirth: '1994-03-12',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('lowercases email', () => {
    expect(loginSchema.parse({ email: 'A@B.co', password: 'x' }).email).toBe('a@b.co');
  });
});

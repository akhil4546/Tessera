import { describe, expect, it } from 'vitest';
import { ADULT_AGE, MIN_SIGNUP_AGE, ageOn, isMinorAge, parseIsoDateOnly } from './age';

describe('parseIsoDateOnly', () => {
  it('parses a calendar date', () => {
    const date = parseIsoDateOnly('2008-05-01');
    expect(date.toISOString().startsWith('2008-05-01')).toBe(true);
  });

  it('rejects impossible dates', () => {
    expect(() => parseIsoDateOnly('2020-02-31')).toThrow();
  });
});

describe('ageOn', () => {
  it('is 17 the day before the 18th birthday', () => {
    const dob = parseIsoDateOnly('2008-09-18');
    expect(ageOn(dob, new Date(Date.UTC(2026, 8, 17)))).toBe(17);
    expect(isMinorAge(17)).toBe(true);
  });

  it('turns 18 on the birthday', () => {
    const dob = parseIsoDateOnly('2008-09-18');
    expect(ageOn(dob, new Date(Date.UTC(2026, 8, 18)))).toBe(ADULT_AGE);
    expect(isMinorAge(ADULT_AGE)).toBe(false);
  });

  it('enforces the sign-up floor', () => {
    expect(MIN_SIGNUP_AGE).toBe(13);
  });
});

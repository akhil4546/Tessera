import { describe, expect, it } from 'vitest';
import { extractBioUrls, updateProfileSchema } from './profile';

describe('extractBioUrls', () => {
  it('pulls unique http(s) links out of a bio', () => {
    expect(
      extractBioUrls('Photos at https://asha.example and also https://asha.example/now.'),
    ).toEqual(['https://asha.example', 'https://asha.example/now']);
  });
});

describe('updateProfileSchema', () => {
  it('caps links at three', () => {
    const links = [
      { title: 'a', url: 'https://a.example' },
      { title: 'b', url: 'https://b.example' },
      { title: 'c', url: 'https://c.example' },
      { title: 'd', url: 'https://d.example' },
    ];
    expect(updateProfileSchema.safeParse({ links }).success).toBe(false);
  });

  it('accepts a bio-only patch', () => {
    expect(updateProfileSchema.parse({ bio: 'hello' }).bio).toBe('hello');
  });
});

import { describe, expect, it } from 'vitest';
import { zipStore } from './zip-store.ts';

describe('zipStore', () => {
  it('writes a zip with local headers and an end record', () => {
    const zip = zipStore([
      { name: 'account.json', body: Buffer.from('{"ok":true}') },
      { name: 'media/a.jpg', body: Buffer.from([0xff, 0xd8, 0xff]) },
    ]);
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(zip.includes(Buffer.from('account.json'))).toBe(true);
    expect(zip.subarray(zip.length - 22, zip.length - 18).toString('hex')).toBe('504b0506');
  });
});

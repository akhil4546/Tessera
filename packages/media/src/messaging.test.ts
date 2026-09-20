import { describe, expect, it } from 'vitest';
import { E2E_VERSION_PLAINTEXT, MAX_GROUP_MEMBERS, MESSAGE_EDIT_WINDOW_MS } from '@tessera/types';
import { MAX_VOICE_DURATION_MS } from './process-voice.ts';

describe('messaging constants (E2E-ready plaintext v1)', () => {
  it('keeps a plaintext version flag and a 15-minute edit window', () => {
    expect(E2E_VERSION_PLAINTEXT).toBe(0);
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(MAX_GROUP_MEMBERS).toBe(32);
    expect(MAX_VOICE_DURATION_MS).toBe(60_000);
  });
});

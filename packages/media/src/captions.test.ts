import { describe, expect, it } from 'vitest';
import { cuesToWebVtt, parseWebVtt, resolveCaptionProvider } from './captions.ts';

describe('WebVTT round-trip', () => {
  it('writes and parses cues', () => {
    const vtt = cuesToWebVtt([
      { startMs: 0, endMs: 1200, text: 'clay dust' },
      { startMs: 1500, endMs: 2400, text: 'original audio' },
    ]);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(parseWebVtt(vtt)).toEqual([
      { startMs: 0, endMs: 1200, text: 'clay dust' },
      { startMs: 1500, endMs: 2400, text: 'original audio' },
    ]);
  });
});

describe('caption provider', () => {
  it('skips with a labelled reason unless a provider is configured', async () => {
    const none = resolveCaptionProvider({ CAPTION_PROVIDER: undefined, WHISPER_BIN: undefined });
    const skipped = await none.transcribe({ audio: Buffer.from([]), durationMs: 2000 });
    expect(skipped).toEqual({ status: 'skipped', reason: 'CAPTIONS_NOT_CONFIGURED' });

    const fixture = resolveCaptionProvider({ CAPTION_PROVIDER: 'fixture' });
    const ready = await fixture.transcribe({ audio: Buffer.from([]), durationMs: 2000 });
    expect(ready.status).toBe('ready');
  });
});

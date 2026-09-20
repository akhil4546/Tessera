import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_VOICE_DURATION_MS } from '@tessera/types';
import { extractAac, ffmpegAvailable, probeDurationFromFile, probeDurationMs, runFfmpeg } from './ffmpeg.ts';

export { MAX_VOICE_DURATION_MS };

export class VoiceTooLongError extends Error {
  readonly code = 'VOICE_TOO_LONG';
  constructor(durationMs: number) {
    super(`Voice notes can be ${MAX_VOICE_DURATION_MS / 1000} seconds (got ${Math.round(durationMs / 1000)}s).`);
  }
}

export type ProcessedVoice = {
  durationMs: number;
  audio: Buffer;
  mimeType: string;
  transcoded: boolean;
};

/**
 * Transcode voice notes to AAC when FFmpeg is present. If it is missing, keep the original
 * and still mark the media ready — labelled, not faked.
 */
export async function processVoice(original: Buffer): Promise<ProcessedVoice> {
  if (!(await ffmpegAvailable())) {
    const durationMs = await probeDurationMs(original).catch(() => 0);
    if (durationMs > MAX_VOICE_DURATION_MS) throw new VoiceTooLongError(durationMs);
    return { durationMs, audio: original, mimeType: 'application/octet-stream', transcoded: false };
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'tessera-voice-'));
  const source = path.join(dir, 'in.bin');
  const dest = path.join(dir, 'voice.m4a');
  try {
    await writeFile(source, original);
    const durationMs = await probeDurationFromFile(source);
    if (durationMs > MAX_VOICE_DURATION_MS) throw new VoiceTooLongError(durationMs);
    await extractAac(source, dest);
    const audio = await readFile(dest);
    return { durationMs, audio, mimeType: 'audio/mp4', transcoded: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function synthesizeTestVoice(dest: string, durationSec = 1): Promise<void> {
  await runFfmpeg('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationSec}`,
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    dest,
  ]);
}

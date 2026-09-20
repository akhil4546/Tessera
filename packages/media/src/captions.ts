export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type CaptionResult =
  | { status: 'ready'; cues: CaptionCue[] }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export type CaptionProvider = {
  name: string;
  transcribe(input: { audio: Buffer; durationMs: number }): Promise<CaptionResult>;
};

function pad(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const milli = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

export function cuesToWebVtt(cues: CaptionCue[]): string {
  const lines = ['WEBVTT', ''];
  for (const cue of cues) {
    if (!cue.text.trim()) continue;
    lines.push(`${pad(cue.startMs)} --> ${pad(cue.endMs)}`);
    lines.push(cue.text.trim());
    lines.push('');
  }
  return lines.join('\n');
}

export function parseWebVtt(source: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const blocks = source.replace(/^\uFEFF/, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim() && line.trim() !== 'WEBVTT');
    const timing = lines.find((line) => line.includes('-->'));
    if (!timing) continue;
    const [start, end] = timing.split('-->').map((part) => parseTimestamp(part.trim()));
    const text = lines
      .filter((line) => line !== timing && !/^\d+$/.test(line.trim()))
      .join(' ')
      .trim();
    if (start == null || end == null || !text) continue;
    cues.push({ startMs: start, endMs: end, text });
  }
  return cues;
}

function parseTimestamp(value: string): number | null {
  const match = value.match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milli = Number(match[4]);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milli;
}

const skipped: CaptionProvider = {
  name: 'none',
  async transcribe() {
    return {
      status: 'skipped',
      reason: 'CAPTIONS_NOT_CONFIGURED',
    };
  },
};

const fixture: CaptionProvider = {
  name: 'fixture',
  async transcribe({ durationMs }) {
    const end = Math.max(800, Math.min(durationMs, 2500));
    return {
      status: 'ready',
      cues: [{ startMs: 0, endMs: end, text: 'Original audio' }],
    };
  },
};

export function resolveCaptionProvider(env: NodeJS.ProcessEnv = process.env): CaptionProvider {
  if (env.CAPTION_PROVIDER === 'fixture') return fixture;
  if (env.WHISPER_BIN) {
    return {
      name: 'whisper',
      async transcribe() {
        return {
          status: 'skipped',
          reason: 'WHISPER_NOT_WIRED',
        };
      },
    };
  }
  return skipped;
}

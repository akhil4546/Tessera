import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runFfmpeg('ffmpeg', ['-version']);
    await runFfmpeg('ffprobe', ['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function probeDurationMs(input: Buffer): Promise<number> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tessera-probe-'));
  const file = path.join(dir, 'in.bin');
  try {
    await writeFile(file, input);
    return probeDurationFromFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function probeDurationFromFile(file: string): Promise<number> {
  const out = await runFfmpeg('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number.parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error('Could not read video duration.');
  return Math.round(seconds * 1000);
}

export async function probeSize(file: string): Promise<{ width: number; height: number }> {
  const out = await runFfmpeg('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ]);
  const [w, h] = out
    .trim()
    .split(',')
    .map((part) => Number.parseInt(part, 10));
  if (!w || !h) throw new Error('Could not read video size.');
  return { width: w, height: h };
}

export function atempoChain(speed: number): string {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0001) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5 - 1e-6) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  const rounded = Math.round(remaining * 1000) / 1000;
  if (Math.abs(rounded - 1) > 0.001) filters.push(`atempo=${rounded}`);
  return filters.join(',');
}

export async function extractFrame(source: string, dest: string, atMs: number): Promise<void> {
  const seconds = Math.max(0, atMs) / 1000;
  await runFfmpeg('ffmpeg', [
    '-y',
    '-ss',
    seconds.toFixed(3),
    '-i',
    source,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    dest,
  ]);
}

export async function extractAac(source: string, dest: string): Promise<void> {
  await runFfmpeg('ffmpeg', ['-y', '-i', source, '-vn', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', dest]);
}

export async function waveformPeaks(audioFile: string, buckets = 64): Promise<number[]> {
  const dir = path.dirname(audioFile);
  const pcm = path.join(dir, 'wave.s16');
  try {
    await runFfmpeg('ffmpeg', [
      '-y',
      '-i',
      audioFile,
      '-ac',
      '1',
      '-ar',
      '8000',
      '-f',
      's16le',
      pcm,
    ]);
  } catch {
    return Array.from({ length: buckets }, () => 0);
  }
  const buf = await readFile(pcm).catch(() => Buffer.alloc(0));
  if (buf.length < 4) return Array.from({ length: buckets }, () => 0);
  const samples = buf.length / 2;
  const size = Math.max(1, Math.floor(samples / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    let max = 0;
    const start = i * size;
    const end = Math.min(samples, start + size);
    for (let s = start; s < end; s += 1) {
      const value = Math.abs(buf.readInt16LE(s * 2)) / 32767;
      if (value > max) max = value;
    }
    peaks.push(Math.round(max * 1000) / 1000);
  }
  return peaks;
}

export async function synthesizeTestVideo(opts: {
  dest: string;
  durationSec?: number;
  width?: number;
  height?: number;
  color?: string;
  withTone?: boolean;
}): Promise<void> {
  const duration = opts.durationSec ?? 2;
  const width = opts.width ?? 720;
  const height = opts.height ?? 1280;
  const color = opts.color ?? '0xC8553D';
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=${width}x${height}:d=${duration}`,
  ];
  if (opts.withTone !== false) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`);
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (opts.withTone !== false) args.push('-c:a', 'aac');
  args.push('-t', String(duration), opts.dest);
  await runFfmpeg('ffmpeg', args);
}

export function ffmpegMissingError(): Error {
  return Object.assign(
    new Error('FFMPEG_MISSING: FFmpeg is not installed. Video cannot be processed until it is.'),
    { code: 'FFMPEG_MISSING' },
  );
}

export function runFfmpeg(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

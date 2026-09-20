import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractFrame, ffmpegAvailable, ffmpegMissingError, probeDurationMs, runFfmpeg } from './ffmpeg.ts';
import { processImage } from './process-image.ts';

export const MAX_VIDEO_DURATION_MS = 60_000;
export const MAX_MOMENT_VIDEO_DURATION_MS = 30_000;
export const MAX_LOOP_DURATION_MS = 90_000;

export { ffmpegAvailable, probeDurationMs } from './ffmpeg.ts';

export type ProcessedVideo = {
  durationMs: number;
  width: number;
  height: number;
  aspect: number;
  thumbnail: Awaited<ReturnType<typeof processImage>>;
  hls: { master: Buffer; renditions: { height: number; playlist: Buffer; segments: { name: string; body: Buffer }[] }[] };
  ffmpegMissing: false;
};

export type VideoProcessError = {
  ffmpegMissing: true;
  message: string;
};

export async function processVideo(
  input: Buffer,
  opts: { maxDurationMs?: number; coverFrameMs?: number } = {},
): Promise<ProcessedVideo> {
  const available = await ffmpegAvailable();
  if (!available) {
    throw ffmpegMissingError();
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'tessera-vid-'));
  const source = path.join(dir, 'source.bin');
  const maxDurationMs = opts.maxDurationMs ?? MAX_VIDEO_DURATION_MS;
  try {
    await writeFile(source, input);
    const durationMs = await probeDurationMs(input);
    if (durationMs > maxDurationMs) {
      const seconds = Math.round(maxDurationMs / 1000);
      throw Object.assign(new Error(`Video must be ${seconds} seconds or shorter.`), { code: 'VIDEO_TOO_LONG' });
    }

    const thumbPath = path.join(dir, 'thumb.jpg');
    const coverMs = opts.coverFrameMs ?? Math.min(400, Math.max(0, durationMs - 50));
    await extractFrame(source, thumbPath, coverMs);
    const thumbBuf = await readFile(thumbPath);
    const thumbnail = await processImage(thumbBuf);

    const heights = [360, 720, 1080].filter((h) => h <= Math.max(thumbnail.height, 720) + 80);
    const renditions: ProcessedVideo['hls']['renditions'] = [];
    const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];

    for (const height of heights) {
      const outDir = path.join(dir, `h${height}`);
      await mkdir(outDir, { recursive: true });
      const playlist = path.join(outDir, 'index.m3u8');
      await runFfmpeg('ffmpeg', [
        '-y',
        '-i',
        source,
        '-vf',
        `scale=-2:${height}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-ac',
        '2',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        path.join(outDir, 'seg%03d.ts'),
        playlist,
      ]);
      const playlistBuf = await readFile(playlist);
      const segments: { name: string; body: Buffer }[] = [];
      const listed = playlistBuf
        .toString('utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('.ts'));
      for (const name of listed) {
        segments.push({ name, body: await readFile(path.join(outDir, name)) });
      }
      renditions.push({ height, playlist: playlistBuf, segments });
      const bandwidth = height >= 1080 ? 4500000 : height >= 720 ? 2500000 : 800000;
      const width = Math.round((thumbnail.width / thumbnail.height) * height) || Math.round((height * 9) / 16);
      masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height}`);
      masterLines.push(`h${height}/index.m3u8`);
    }

    return {
      durationMs,
      width: thumbnail.width,
      height: thumbnail.height,
      aspect: thumbnail.aspect,
      thumbnail,
      hls: { master: Buffer.from(masterLines.join('\n') + '\n'), renditions },
      ffmpegMissing: false,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}



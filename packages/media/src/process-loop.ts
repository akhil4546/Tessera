import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TesseraPrisma } from '@tessera/db';
import { cuesToWebVtt, resolveCaptionProvider } from './captions.ts';
import {
  atempoChain,
  extractAac,
  extractFrame,
  ffmpegAvailable,
  ffmpegMissingError,
  probeDurationFromFile,
  runFfmpeg,
  waveformPeaks,
} from './ffmpeg.ts';
import { isScheduledPending } from './audience.ts';
import { fanoutPost } from './fanout.ts';
import { indexPublishedPost } from './index-documents.ts';
import {
  audioTitleFromCaption,
  composedDurationMs,
  parseClipRecipes,
  type LoopClipRecipe,
} from './loops.ts';
import { processImage } from './process-image.ts';
import type { MediaLogger } from './logger.ts';
import { MAX_LOOP_DURATION_MS, processVideo } from './process-video.ts';
import type { ObjectStorage } from './storage.ts';
import { classificationHolds, resolveClassifier } from './classifier.ts';
import { classifyAndStore } from './classify-media.ts';
import type { VariantMap } from './variants.ts';

export async function prepareLoopClip(
  prisma: TesseraPrisma,
  storage: ObjectStorage,
  mediaId: string,
  log: MediaLogger,
): Promise<void> {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
  if (!item) return;
  if (!(await ffmpegAvailable())) {
    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: { status: 'failed', processingError: 'FFMPEG_MISSING' },
    });
    throw ffmpegMissingError();
  }
  const original = await storage.get(item.originalKey);
  const dir = await mkdtemp(path.join(tmpdir(), 'tessera-loop-clip-'));
  try {
    const source = path.join(dir, 'source.bin');
    await writeFile(source, original);
    const durationMs = await probeDurationFromFile(source);
    if (durationMs > MAX_LOOP_DURATION_MS) {
      throw Object.assign(new Error('Loop clips can be 90 seconds at most.'), { code: 'VIDEO_TOO_LONG' });
    }
    const thumbPath = path.join(dir, 'thumb.jpg');
    await extractFrame(source, thumbPath, Math.min(400, Math.max(0, durationMs - 50)));
    const thumbnail = await processImage(await readFile(thumbPath));
    const widths: VariantMap['widths'] = {};
    for (const variant of thumbnail.variants) {
      const webpKey = `${item.originalKey}.poster.w${variant.width}.webp`;
      const avifKey = `${item.originalKey}.poster.w${variant.width}.avif`;
      await storage.put(webpKey, variant.webp, 'image/webp');
      await storage.put(avifKey, variant.avif, 'image/avif');
      widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
    }
    const posterKey = widths['640']?.webp ?? Object.values(widths)[0]?.webp;
    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: {
        status: 'ready',
        width: thumbnail.width,
        height: thumbnail.height,
        aspect: thumbnail.aspect,
        durationMs,
        blurhash: thumbnail.blurhash,
        variants: { widths, posterKey } satisfies VariantMap,
        processingError: null,
      },
    });
    log.info({ mediaId, durationMs }, 'prepared Loop clip (poster only, HLS waits for compose)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function processLoop(
  prisma: TesseraPrisma,
  storage: ObjectStorage,
  postId: string,
  log: MediaLogger,
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { loop: true, media: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!post || post.kind !== 'loop' || !post.loop || post.deletedAt) {
    log.warn({ postId }, 'processLoop: missing loop post');
    return;
  }
  if (!(await ffmpegAvailable())) {
    const first = post.media[0];
    if (first) {
      await prisma.mediaItem.update({
        where: { id: first.id },
        data: { status: 'failed', processingError: 'FFMPEG_MISSING' },
      });
    }
    throw ffmpegMissingError();
  }

  const recipes = parseClipRecipes(post.loop.clips);
  const clipMedia = recipes.length
    ? await prisma.mediaItem.findMany({ where: { id: { in: recipes.map((c) => c.mediaId) } } })
    : post.media;
  const ordered: { recipe: LoopClipRecipe; media: (typeof clipMedia)[number] }[] = [];
  if (recipes.length) {
    for (const recipe of recipes) {
      const media = clipMedia.find((row) => row.id === recipe.mediaId);
      if (!media) throw Object.assign(new Error('Loop clip media is missing.'), { code: 'MEDIA_NOT_FOUND' });
      ordered.push({ recipe, media });
    }
  } else if (post.media[0]) {
    const media = post.media[0];
    ordered.push({
      recipe: {
        mediaId: media.id,
        trimStartMs: 0,
        trimEndMs: media.durationMs ?? MAX_LOOP_DURATION_MS,
        speed: 1,
      },
      media,
    });
  }
  if (ordered.length === 0) throw Object.assign(new Error('A Loop needs video.'), { code: 'VALIDATION' });

  const total = composedDurationMs(ordered.map((row) => row.recipe));
  if (total > MAX_LOOP_DURATION_MS) {
    throw Object.assign(new Error('Loops can be 90 seconds at most, after trim and speed.'), {
      code: 'VIDEO_TOO_LONG',
    });
  }

  const output = post.media[0] ?? ordered[0]!.media;
  await prisma.mediaItem.update({
    where: { id: output.id },
    data: { status: 'processing', processingError: null, postId },
  });

  const dir = await mkdtemp(path.join(tmpdir(), 'tessera-loop-'));
  try {
    const prepared: string[] = [];
    for (const [index, row] of ordered.entries()) {
      const source = path.join(dir, `src${index}.bin`);
      await writeFile(source, await storage.get(row.media.originalKey));
      const clipOut = path.join(dir, `clip${index}.mp4`);
      await renderClip(source, clipOut, row.recipe);
      prepared.push(clipOut);
    }
    const composed = path.join(dir, 'composed.mp4');
    await concatClips(prepared, composed);

    let timed = composed;
    if (post.loop.audioTrackId) {
      const track = await prisma.audioTrack.findUnique({ where: { id: post.loop.audioTrackId } });
      if (track) {
        const reused = path.join(dir, 'reused.m4a');
        await writeFile(reused, await storage.get(track.audioKey));
        const muxed = path.join(dir, 'muxed.mp4');
        await muxAudio(composed, reused, muxed);
        timed = muxed;
      }
    }

    const composedBuf = await readFile(timed);
    const video = await processVideo(composedBuf, {
      maxDurationMs: MAX_LOOP_DURATION_MS,
      coverFrameMs: post.loop.coverFrameMs,
    });

    const widths: VariantMap['widths'] = {};
    for (const variant of video.thumbnail.variants) {
      const webpKey = `${output.originalKey}.poster.w${variant.width}.webp`;
      const avifKey = `${output.originalKey}.poster.w${variant.width}.avif`;
      await storage.put(webpKey, variant.webp, 'image/webp');
      await storage.put(avifKey, variant.avif, 'image/avif');
      widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
    }
    const posterKey = widths['640']?.webp ?? Object.values(widths)[0]?.webp;
    const masterKey = `${output.originalKey}.hls/master.m3u8`;
    await storage.put(masterKey, video.hls.master, 'application/vnd.apple.mpegurl');
    for (const rendition of video.hls.renditions) {
      const prefix = `${output.originalKey}.hls/h${rendition.height}`;
      await storage.put(`${prefix}/index.m3u8`, rendition.playlist, 'application/vnd.apple.mpegurl');
      for (const segment of rendition.segments) {
        await storage.put(`${prefix}/${segment.name}`, segment.body, 'video/MP2T');
      }
    }

    let audioKey: string | undefined;
    if (!post.loop.audioTrackId && post.loop.allowAudioReuse) {
      const aacPath = path.join(dir, 'original.m4a');
      try {
        await extractAac(timed, aacPath);
        audioKey = `${output.originalKey}.audio.m4a`;
        const aac = await readFile(aacPath);
        await storage.put(audioKey, aac, 'audio/mp4');
        const peaks = await waveformPeaks(aacPath);
        const track = await prisma.audioTrack.upsert({
          where: { sourcePostId: post.id },
          create: {
            ownerId: post.authorId,
            sourcePostId: post.id,
            title: audioTitleFromCaption(post.caption),
            allowReuse: true,
            durationMs: video.durationMs,
            audioKey,
            waveform: peaks,
            useCount: 1,
          },
          update: {
            audioKey,
            waveform: peaks,
            durationMs: video.durationMs,
            allowReuse: post.loop.allowAudioReuse,
          },
        });
        await prisma.loop.update({
          where: { postId: post.id },
          data: { audioTrackId: track.id },
        });
      } catch (err) {
        log.warn({ err, postId }, 'original audio extract failed; Loop still publishes');
      }
    } else if (post.loop.audioTrackId) {
      await prisma.audioTrack.update({
        where: { id: post.loop.audioTrackId },
        data: { useCount: { increment: 1 } },
      });
    }

    const caption = await captionLoop(storage, timed, video.durationMs, output.originalKey, log);
    await prisma.loop.update({
      where: { postId: post.id },
      data: {
        captionStatus: caption.status,
        captionError: caption.error,
        captionsKey: caption.key,
      },
    });

    const classification = await classifyAndStore(prisma, output.id, log, resolveClassifier());
    const hold = classificationHolds(classification);
    await prisma.mediaItem.update({
      where: { id: output.id },
      data: {
        status: 'ready',
        width: video.width,
        height: video.height,
        aspect: video.aspect,
        durationMs: video.durationMs,
        blurhash: video.thumbnail.blurhash,
        variants: {
          widths,
          posterKey,
          hls: { masterKey },
          audioKey,
          captionsKey: caption.key,
        } satisfies VariantMap,
        processingError: null,
        postId: post.id,
        sortOrder: 0,
        moderationHold: hold,
        sensitive: classification.nudity === 'likely' || classification.violence === 'likely',
      },
    });

    if (hold) {
      log.warn({ postId, mediaId: output.id }, 'Loop held for human review; not published');
    } else if (!post.publishedAt && !isScheduledPending(post)) {
      await prisma.post.update({
        where: { id: post.id },
        data: { publishedAt: new Date() },
      });
      await fanoutPost(prisma, post.id);
      await indexPublishedPost(prisma, post.id);
      log.info({ postId, mediaId: output.id }, 'published Loop after compose');
    } else if (isScheduledPending(post)) {
      log.info({ postId, mediaId: output.id }, 'scheduled Loop media ready; waiting for publish job');
    } else {
      await fanoutPost(prisma, post.id);
      await indexPublishedPost(prisma, post.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    log.error({ err, postId }, 'loop processing failed');
    await prisma.mediaItem.update({
      where: { id: output.id },
      data: { status: 'failed', processingError: message.slice(0, 500) },
    });
    await prisma.loop.update({
      where: { postId: post.id },
      data: { captionStatus: 'failed', captionError: message.slice(0, 200) },
    });
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function renderClip(source: string, dest: string, recipe: LoopClipRecipe): Promise<void> {
  const start = recipe.trimStartMs / 1000;
  const duration = Math.max(0.05, (recipe.trimEndMs - recipe.trimStartMs) / 1000);
  const speed = recipe.speed;
  const videoFilter = speed === 1 ? 'null' : `setpts=PTS/${speed}`;
  const audioTempo = atempoChain(speed);
  const audioFilter = audioTempo ? audioTempo : 'anull';
  const outDuration = duration / speed;
  await runFfmpeg('ffmpeg', [
    '-y',
    '-ss',
    start.toFixed(3),
    '-t',
    duration.toFixed(3),
    '-i',
    source,
    '-f',
    'lavfi',
    '-t',
    duration.toFixed(3),
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex',
    `[0:v]${videoFilter}[v];[0:a]${audioFilter}[aorig];[1:a]${audioFilter}[afallback];[aorig][afallback]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-t',
    outDuration.toFixed(3),
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
    '-pix_fmt',
    'yuv420p',
    dest,
  ]).catch(async () => {
    await runFfmpeg('ffmpeg', [
      '-y',
      '-ss',
      start.toFixed(3),
      '-t',
      duration.toFixed(3),
      '-i',
      source,
      '-f',
      'lavfi',
      '-t',
      duration.toFixed(3),
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex',
      `[0:v]${videoFilter}[v];[1:a]${audioFilter}[a]`,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-t',
      outDuration.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '26',
      '-c:a',
      'aac',
      '-pix_fmt',
      'yuv420p',
      dest,
    ]);
  });
}

async function concatClips(files: string[], dest: string): Promise<void> {
  if (files.length === 1) {
    await runFfmpeg('ffmpeg', ['-y', '-i', files[0]!, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', dest]);
    return;
  }
  const args = ['-y'];
  for (const file of files) args.push('-i', file);
  const parts = files.map((_, index) => `[${index}:v][${index}:a]`).join('');
  args.push(
    '-filter_complex',
    `${parts}concat=n=${files.length}:v=1:a=1[v][a]`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'aac',
    dest,
  );
  await runFfmpeg('ffmpeg', args);
}

async function muxAudio(video: string, audio: string, dest: string): Promise<void> {
  await runFfmpeg('ffmpeg', [
    '-y',
    '-i',
    video,
    '-stream_loop',
    '-1',
    '-i',
    audio,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    dest,
  ]);
}

async function captionLoop(
  storage: ObjectStorage,
  videoPath: string,
  durationMs: number,
  originalKey: string,
  log: MediaLogger,
): Promise<{ status: 'ready' | 'skipped' | 'failed'; error: string | null; key: string | undefined }> {
  const provider = resolveCaptionProvider();
  const dir = path.dirname(videoPath);
  const aac = path.join(dir, 'caption.m4a');
  try {
    await extractAac(videoPath, aac);
    const audio = await readFile(aac);
    const result = await provider.transcribe({ audio, durationMs });
    if (result.status === 'skipped') {
      log.info({ reason: result.reason }, 'Loop captions skipped (labelled, not stubbed)');
      return { status: 'skipped', error: result.reason, key: undefined };
    }
    if (result.status === 'failed') {
      return { status: 'failed', error: result.reason, key: undefined };
    }
    const key = `${originalKey}.captions.vtt`;
    await storage.put(key, Buffer.from(cuesToWebVtt(result.cues), 'utf8'), 'text/vtt');
    return { status: 'ready', error: null, key };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'caption failed';
    log.warn({ err }, 'Loop caption job failed');
    return { status: 'failed', error: message.slice(0, 200), key: undefined };
  }
}

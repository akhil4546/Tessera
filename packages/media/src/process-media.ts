import type { TesseraPrisma } from '@tessera/db';
import { parseAdjustments } from './adjustments.ts';
import { isScheduledPending } from './audience.ts';
import { fanoutPost } from './fanout.ts';
import { indexPublishedPost } from './index-documents.ts';
import type { MediaLogger } from './logger.ts';
import { MAX_MOMENT_VIDEO_DURATION_MS, momentExpiresAt } from './moments.ts';
import { processImage } from './process-image.ts';
import { prepareLoopClip, processLoop } from './process-loop.ts';
import { MAX_VIDEO_DURATION_MS, processVideo } from './process-video.ts';
import { processVoice, VoiceTooLongError } from './process-voice.ts';
import type { ObjectStorage } from './storage.ts';
import { classificationHolds, resolveClassifier, type MediaClassifier } from './classifier.ts';
import { classifyAndStore } from './classify-media.ts';
import { type VariantMap } from './variants.ts';

export type { MediaLogger } from './logger.ts';

export async function processMediaItem(
  prisma: TesseraPrisma,
  storage: ObjectStorage,
  mediaId: string,
  log: MediaLogger,
  classifier: MediaClassifier = resolveClassifier(),
): Promise<void> {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
  if (!item) {
    log.warn({ mediaId }, 'processMediaItem: missing row');
    return;
  }

  await prisma.mediaItem.update({
    where: { id: mediaId },
    data: { status: 'processing', processingError: null },
  });

  try {
    if (item.purpose === 'loop' && item.kind === 'video') {
      const attached = await prisma.mediaItem.findUnique({
        where: { id: mediaId },
        include: { post: { include: { loop: true } } },
      });
      if (attached?.post?.kind === 'loop' && attached.post.loop) {
        await processLoop(prisma, storage, attached.post.id, log);
        return;
      }
      await prepareLoopClip(prisma, storage, mediaId, log);
      return;
    }

    const original = await storage.get(item.originalKey);
    const adjustments = parseAdjustments(item.adjustments);

    if (item.kind === 'audio') {
      try {
        const voice = await processVoice(original);
        let audioKey = item.originalKey;
        if (voice.transcoded) {
          audioKey = `${item.originalKey}.m4a`;
          await storage.put(audioKey, voice.audio, voice.mimeType);
        }
        await prisma.mediaItem.update({
          where: { id: mediaId },
          data: {
            status: 'ready',
            durationMs: voice.durationMs || null,
            variants: { widths: {}, audioKey } satisfies VariantMap,
            processingError: voice.transcoded ? null : 'FFMPEG_MISSING',
          },
        });
      } catch (err) {
        if (err instanceof VoiceTooLongError) {
          await prisma.mediaItem.update({
            where: { id: mediaId },
            data: { status: 'failed', processingError: err.message },
          });
          return;
        }
        throw err;
      }
      return;
    }

    if (item.kind === 'image') {
      const processed = await processImage(original, {
        crop: item.crop,
        filterId: item.filterId,
        adjustments,
      });

      const widths: VariantMap['widths'] = {};
      for (const variant of processed.variants) {
        const webpKey = `${item.originalKey}.w${variant.width}.webp`;
        const avifKey = `${item.originalKey}.w${variant.width}.avif`;
        await storage.put(webpKey, variant.webp, 'image/webp');
        await storage.put(avifKey, variant.avif, 'image/avif');
        widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
      }

      const classification = await classifyAndStore(prisma, mediaId, log, classifier);
      const hold = classificationHolds(classification);
      await prisma.mediaItem.update({
        where: { id: mediaId },
        data: {
          status: 'ready',
          width: processed.width,
          height: processed.height,
          aspect: processed.aspect,
          blurhash: processed.blurhash,
          variants: { widths },
          processingError: null,
          moderationHold: hold,
          sensitive: classificationMarksOrExisting(classification.nudity, classification.violence),
        },
      });
      if (!hold) await maybePublishParents(prisma, mediaId, log);
      else log.warn({ mediaId }, 'media ready but held for human review');
      return;
    }

    const video = await processVideo(original, {
      maxDurationMs: item.purpose === 'moment' ? MAX_MOMENT_VIDEO_DURATION_MS : MAX_VIDEO_DURATION_MS,
    });
    const widths: VariantMap['widths'] = {};
    for (const variant of video.thumbnail.variants) {
      const webpKey = `${item.originalKey}.poster.w${variant.width}.webp`;
      const avifKey = `${item.originalKey}.poster.w${variant.width}.avif`;
      await storage.put(webpKey, variant.webp, 'image/webp');
      await storage.put(avifKey, variant.avif, 'image/avif');
      widths[String(variant.width)] = { webp: webpKey, avif: avifKey };
    }
    const posterKey = widths['640']?.webp ?? Object.values(widths)[0]?.webp;
    const masterKey = `${item.originalKey}.hls/master.m3u8`;
    await storage.put(masterKey, video.hls.master, 'application/vnd.apple.mpegurl');
    for (const rendition of video.hls.renditions) {
      const prefix = `${item.originalKey}.hls/h${rendition.height}`;
      await storage.put(`${prefix}/index.m3u8`, rendition.playlist, 'application/vnd.apple.mpegurl');
      for (const segment of rendition.segments) {
        await storage.put(`${prefix}/${segment.name}`, segment.body, 'video/MP2T');
      }
    }

    const classification = await classifyAndStore(prisma, mediaId, log, classifier);
    const hold = classificationHolds(classification);
    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: {
        status: 'ready',
        width: video.width,
        height: video.height,
        aspect: video.aspect,
        durationMs: video.durationMs,
        blurhash: video.thumbnail.blurhash,
        variants: { widths, posterKey, hls: { masterKey } } satisfies VariantMap,
        processingError: null,
        moderationHold: hold,
        sensitive: classificationMarksOrExisting(classification.nudity, classification.violence),
      },
    });
    if (!hold) await maybePublishParents(prisma, mediaId, log);
    else log.warn({ mediaId }, 'video ready but held for human review');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'PROCESS_FAILED';
    log.error({ err, mediaId, code }, 'media processing failed');
    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: { status: 'failed', processingError: message.slice(0, 500) },
    });
  }
}

async function maybePublishParents(prisma: TesseraPrisma, mediaId: string, log: MediaLogger): Promise<void> {
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: {
      post: { include: { media: true } },
      momentSegments: {
        include: {
          moment: { include: { segments: { include: { media: true } } } },
        },
      },
    },
  });
  if (!item) return;

  if (item.post && !item.post.publishedAt && !item.post.deletedAt) {
    if (item.post.media.some((row) => row.moderationHold)) {
      log.warn({ postId: item.post.id, mediaId }, 'post held: classifier asked for human review');
    } else if (isScheduledPending(item.post)) {
      log.info({ postId: item.post.id, mediaId }, 'scheduled post media ready; waiting for publish job');
    } else if (item.post.media.every((row) => row.status === 'ready')) {
      await prisma.post.update({
        where: { id: item.post.id },
        data: { publishedAt: new Date() },
      });
      await fanoutPost(prisma, item.post.id);
      await indexPublishedPost(prisma, item.post.id);
      log.info({ postId: item.post.id, mediaId }, 'published post after media ready');
    }
  }

  for (const segment of item.momentSegments) {
    const moment = segment.moment;
    if (moment.publishedAt || moment.deletedAt) continue;
    if (moment.segments.some((row) => row.media.status !== 'ready' || row.media.moderationHold)) continue;
    const publishedAt = new Date();
    await prisma.moment.update({
      where: { id: moment.id },
      data: { publishedAt, expiresAt: momentExpiresAt(publishedAt) },
    });
    log.info({ momentId: moment.id, mediaId }, 'published moment after media ready');
  }
}

function classificationMarksOrExisting(nudity: string, violence: string): boolean {
  return nudity === 'likely' || violence === 'likely';
}

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { asVariantMap, isFilterId, parseAdjustments } from '@tessera/media';
import type { MediaIntent, MediaView, PeopleTagView } from '@tessera/types';
import type { MediaIntentInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { RateLimitService } from '../common/rate-limit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { fsMediaUrl } from '../storage/fs-media-url.js';
import { StorageService } from '../storage/storage.service.js';

const PUT_TTL = 15 * 60;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createIntent(userId: string, input: MediaIntentInput): Promise<MediaIntent> {
    await this.rateLimit.consume(`upload:${userId}`, 40, 60 * 60);
    const id = randomUUID();
    const ext = extensionFor(input.mimeType);
    const originalKey = `${input.purpose}/${userId}/${id}/original.${ext}`;
    const row = await this.prisma.mediaItem.create({
      data: {
        id,
        ownerId: userId,
        purpose: input.purpose,
        kind: input.kind,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        originalKey,
        status: 'awaiting_upload',
      },
    });
    const uploadUrl =
      this.storage.driver === 'fs'
        ? `/v1/media/${row.id}/bytes`
        : await this.storage.signPut(originalKey, input.mimeType, PUT_TTL);
    return {
      id: row.id,
      uploadUrl,
      headers: { 'Content-Type': input.mimeType },
      expiresIn: PUT_TTL,
      maxBytes: input.byteSize,
      driver: this.storage.driver,
      localUploadPath: this.storage.driver === 'fs' ? `/v1/media/${row.id}/bytes` : null,
    };
  }

  async receiveBytes(userId: string, mediaId: string, body: Buffer, contentType: string | undefined): Promise<void> {
    const item = await this.requireOwned(userId, mediaId);
    if (item.status !== 'awaiting_upload') {
      throw new TesseraHttpError(409, 'ALREADY_UPLOADED', 'This upload is already complete.');
    }
    if (body.length > item.byteSize * 1.1) {
      throw new TesseraHttpError(413, 'TOO_LARGE', 'File is larger than declared.');
    }
    await this.storage.put(item.originalKey, body, contentType ?? item.mimeType);
  }

  async complete(userId: string, mediaId: string): Promise<MediaView> {
    const item = await this.requireOwned(userId, mediaId);
    if (item.status === 'awaiting_upload') {
      if (this.storage.driver === 's3') {
        try {
          await this.storage.get(item.originalKey);
        } catch {
          throw new TesseraHttpError(400, 'NOT_UPLOADED', 'Upload the original before completing.');
        }
      }
      await this.prisma.mediaItem.update({
        where: { id: mediaId },
        data: { status: 'uploaded' },
      });
    }
    await this.queues.processMedia(mediaId);
    return this.toView(await this.requireOwned(userId, mediaId));
  }

  async getOwned(userId: string, mediaId: string): Promise<MediaView> {
    return this.toView(await this.requireOwned(userId, mediaId));
  }

  async suggestAlt(userId: string, mediaId: string): Promise<{ suggestion: string | null; reason: string | null }> {
    await this.requireOwned(userId, mediaId);
    if (!process.env.XAI_API_KEY) {
      return { suggestion: null, reason: 'ALT_SUGGEST_NOT_CONFIGURED' };
    }
    return { suggestion: null, reason: 'ALT_SUGGEST_NOT_WIRED' };
  }

  async readFile(key: string, expUnixSeconds?: number): Promise<{ body: Buffer; contentType: string }> {
    let body = await this.storage.get(key);
    if (key.endsWith('.m3u8') && this.storage.driver === 'fs') {
      if (expUnixSeconds == null) {
        throw new TesseraHttpError(403, 'MEDIA_URL_INVALID', 'This media link is invalid or expired.');
      }
      // Child links expire with the playlist URL. A rewrite must not mint a longer grant.
      const dir = key.replace(/\/[^/]+$/, '');
      const rewritten = body
        .toString('utf8')
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || /^https?:\/\//i.test(trimmed)) return line;
          const child = `${dir}/${trimmed.replace(/^\.\//, '')}`;
          return fsMediaUrl(child, expUnixSeconds);
        })
        .join('\n');
      body = Buffer.from(rewritten, 'utf8');
    }
    const contentType = key.endsWith('.avif')
      ? 'image/avif'
      : key.endsWith('.webp')
        ? 'image/webp'
        : key.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : key.endsWith('.ts')
            ? 'video/MP2T'
            : key.endsWith('.vtt')
              ? 'text/vtt'
              : key.endsWith('.m4a') || key.endsWith('.aac')
                ? 'audio/mp4'
                : 'application/octet-stream';
    return { body, contentType };
  }

  async toView(item: {
    id: string;
    kind: 'image' | 'video' | 'audio';
    status: 'awaiting_upload' | 'uploaded' | 'processing' | 'ready' | 'failed';
    width: number | null;
    height: number | null;
    aspect: number | null;
    blurhash: string | null;
    altText: string;
    durationMs: number | null;
    crop: 'original' | 'square' | 'portrait' | 'landscape';
    filterId: string;
    adjustments: unknown;
    variants: unknown;
    originalKey?: string;
    processingError: string | null;
    peopleTags?: { x: number; y: number; taggedUser: { handle: string; profile: { displayName: string } | null } }[];
  }): Promise<MediaView> {
    const variants = asVariantMap(item.variants);
    const srcset = [];
    for (const [width, keys] of Object.entries(variants.widths)) {
      const webp = await this.storage.signGet(keys.webp);
      const avif = await this.storage.signGet(keys.avif);
      if (webp && avif) srcset.push({ width: Number(width), webp, avif });
    }
    srcset.sort((a, b) => a.width - b.width);
    const peopleTags: PeopleTagView[] = (item.peopleTags ?? []).map((tag) => ({
      handle: tag.taggedUser.handle,
      displayName: tag.taggedUser.profile?.displayName ?? tag.taggedUser.handle,
      x: tag.x,
      y: tag.y,
    }));
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      width: item.width,
      height: item.height,
      aspect: item.aspect,
      blurhash: item.blurhash,
      altText: item.altText,
      durationMs: item.durationMs,
      crop: item.crop,
      filterId: isFilterId(item.filterId) ? item.filterId : 'none',
      adjustments: parseAdjustments(item.adjustments),
      srcset,
      posterUrl: await this.storage.signGet(variants.posterKey ?? null),
      hlsUrl: await this.storage.signGet(variants.hls?.masterKey ?? null),
      audioUrl: await this.storage.signGet(
        variants.audioKey ?? (item.kind === 'audio' ? (item.originalKey ?? null) : null),
      ),
      peopleTags,
      processingError: item.processingError,
    };
  }

  private async requireOwned(userId: string, mediaId: string) {
    const item = await this.prisma.mediaItem.findUnique({
      where: { id: mediaId },
      include: { peopleTags: { include: { taggedUser: { include: { profile: true } } } } },
    });
    if (!item || item.ownerId !== userId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Media not found.');
    }
    return item;
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'audio/webm') return 'webm';
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/mp4' || mime === 'audio/aac') return 'm4a';
  return 'jpg';
}

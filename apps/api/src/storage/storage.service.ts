import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createObjectStorage, resolveStorageConfig, type ObjectStorage } from '@tessera/media';
import { signFsMediaUrl } from './fs-media-url.js';

const SIGN_TTL = 60 * 60;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  readonly inner: ObjectStorage;
  readonly driver: 's3' | 'fs';

  constructor() {
    const config = resolveStorageConfig();
    this.driver = config.driver ?? 's3';
    this.inner = createObjectStorage(config);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.inner.ensureReady();
      this.log.log(`Object storage ready (${this.driver}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.log.warn(
        `SOFT-FAIL: object storage not ready (${message}). Uploads will fail until MinIO/S3 or STORAGE_DRIVER=fs is available.`,
      );
    }
  }

  put(key: string, body: Buffer, contentType: string) {
    return this.inner.put(key, body, contentType);
  }

  get(key: string) {
    return this.inner.get(key);
  }

  signPut(key: string, contentType: string, expiresSeconds = 15 * 60) {
    return this.inner.signPut(key, contentType, expiresSeconds);
  }

  async signGet(key: string | null | undefined, expiresSeconds = SIGN_TTL): Promise<string | null> {
    if (!key) return null;
    if (this.driver === 'fs') {
      return signFsMediaUrl(key, expiresSeconds);
    }
    return this.inner.signGet(key, expiresSeconds);
  }
}

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type ObjectStorage = {
  driver: 's3' | 'fs';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signPut(key: string, contentType: string, expiresSeconds: number): Promise<string>;
  signGet(key: string, expiresSeconds: number): Promise<string>;
  ensureReady(): Promise<void>;
};

export type StorageConfig = {
  driver?: 's3' | 'fs';
  s3?: {
    endpoint: string;
    region: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    publicUrl?: string;
  };
  fsRoot?: string;
  corsOrigins?: string[];
};

export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const explicit = env.STORAGE_DRIVER === 'fs' || env.STORAGE_DRIVER === 's3' ? env.STORAGE_DRIVER : undefined;
  const s3Ready = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);
  const driver: 's3' | 'fs' =
    explicit ?? (s3Ready ? 's3' : env.NODE_ENV === 'test' ? 'fs' : 's3');
  return {
    driver,
    s3: {
      endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: env.S3_REGION ?? 'us-east-1',
      accessKey: env.S3_ACCESS_KEY ?? 'tessera',
      secretKey: env.S3_SECRET_KEY ?? 'tessera-minio',
      bucket: env.S3_BUCKET ?? 'tessera-media',
      publicUrl: env.S3_PUBLIC_URL,
    },
    fsRoot: env.STORAGE_FS_ROOT ?? path.resolve(process.cwd(), '.tessera-storage'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  };
}

export function createObjectStorage(config: StorageConfig = resolveStorageConfig()): ObjectStorage {
  if (config.driver === 'fs') {
    return new FsStorage(config.fsRoot ?? path.resolve(process.cwd(), '.tessera-storage'));
  }
  if (!config.s3) {
    throw new Error('STORAGE_NOT_CONFIGURED: S3/MinIO settings are missing.');
  }
  return new S3Storage(config.s3, config.corsOrigins ?? []);
}

class FsStorage implements ObjectStorage {
  readonly driver = 'fs' as const;
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return path.join(this.root, ...safe.split('/'));
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }

  async signPut(key: string): Promise<string> {
    return `fs://local/${key}`;
  }

  async signGet(key: string): Promise<string> {
    return `fs://local/${key}`;
  }
}

class S3Storage implements ObjectStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly corsOrigins: string[];

  constructor(
    s3: NonNullable<StorageConfig['s3']>,
    corsOrigins: string[],
  ) {
    this.bucket = s3.bucket;
    this.corsOrigins = corsOrigins;
    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    });
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedOrigins: this.corsOrigins.length ? this.corsOrigins : ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${key}`);
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    // Keep originals for now; worker overwrites variants. No-op delete is fine in Phase 2.
    void key;
  }

  async signPut(key: string, contentType: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresSeconds },
    );
  }

  async signGet(key: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresSeconds },
    );
  }
}

/** Local-dev helper so the API can accept the fs:// PUT from tests. */
export async function putIfFilesystem(storage: ObjectStorage, key: string, body: Buffer, contentType: string): Promise<void> {
  if (storage.driver === 'fs') {
    await storage.put(key, body, contentType);
  }
}

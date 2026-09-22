import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  JOB_DELIVER_NOTIFICATION,
  JOB_EXPIRE_MOMENTS,
  JOB_FANOUT_POST,
  JOB_NOTIFICATION_DIGEST,
  JOB_PROCESS_LOOP,
  JOB_PROCESS_MEDIA,
  JOB_EXPORT_ACCOUNT,
  JOB_HARD_DELETE,
  JOB_PURGE_IDEMPOTENCY,
  JOB_PUBLISH_SCHEDULED,
  JOB_RETRACT_POST,
  QUEUE_FEED,
  QUEUE_LOOPS,
  QUEUE_MEDIA,
  QUEUE_MOMENTS,
  QUEUE_NOTIFICATIONS,
  QUEUE_SAFETY,
  QUEUE_SCHEDULED,
  expireMoments,
  fanoutPost,
  hardDeleteDueAccounts,
  purgeIdempotencyRecords,
  runExportJob,
  processLoop,
  processMediaItem,
  publishDueScheduledPosts,
  retractPost,
  type DeliverNotificationJob,
  type ExpireMomentsJob,
  type FanoutPostJob,
  type NotificationDigestJob,
  type ProcessLoopJob,
  type ExportAccountJob,
  type HardDeleteJob,
  type PurgeIdempotencyJob,
  type ProcessMediaJob,
  type PublishScheduledJob,
  type RetractPostJob,
} from '@tessera/media';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

function inlinePreferred(): boolean {
  return process.env.MEDIA_PROCESS === 'inline' || process.env.NODE_ENV === 'test';
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private mediaQueue: Queue | null = null;
  private feedQueue: Queue | null = null;
  private momentsQueue: Queue | null = null;
  private loopsQueue: Queue | null = null;
  private notificationsQueue: Queue | null = null;
  private scheduledQueue: Queue | null = null;
  private safetyQueue: Queue | null = null;
  private redis: Redis | null = null;
  private redisDisabled = false;
  private inlineExpiry: ReturnType<typeof setInterval> | null = null;
  private inlineDigest: ReturnType<typeof setInterval> | null = null;
  private inlineScheduled: ReturnType<typeof setInterval> | null = null;
  private inlineHardDelete: ReturnType<typeof setInterval> | null = null;
  private inlineIdempotencyPurge: ReturnType<typeof setInterval> | null = null;
  private deliverFn: ((id: string) => Promise<void>) | null = null;
  private digestFn: ((now?: Date) => Promise<unknown>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  attachNotificationHandlers(handlers: {
    deliver: (id: string) => Promise<void>;
    digest: (now?: Date) => Promise<unknown>;
  }): void {
    this.deliverFn = handlers.deliver;
    this.digestFn = handlers.digest;
  }

  async onModuleInit(): Promise<void> {
    await this.scheduleMomentExpiry();
    await this.scheduleNotificationDigest();
    await this.scheduleScheduledPublish();
    await this.scheduleHardDelete();
    await this.scheduleIdempotencyPurge();
  }

  private connection(): Redis | null {
    if (inlinePreferred() || this.redisDisabled) return null;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!this.redis) {
      this.redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
      this.redis.on('error', (err) => {
        this.log.warn(`SOFT-FAIL: Redis queue error (${err.message}). Processing inline.`);
        this.redisDisabled = true;
      });
    }
    return this.redis;
  }

  private async queues(): Promise<{
    media: Queue;
    feed: Queue;
    moments: Queue;
    loops: Queue;
    notifications: Queue;
    scheduled: Queue;
    safety: Queue;
  } | null> {
    const redis = this.connection();
    if (!redis) return null;
    try {
      if (redis.status === 'wait') await redis.connect();
      this.mediaQueue ??= new Queue(QUEUE_MEDIA, { connection: redis });
      this.feedQueue ??= new Queue(QUEUE_FEED, { connection: redis });
      this.momentsQueue ??= new Queue(QUEUE_MOMENTS, { connection: redis });
      this.loopsQueue ??= new Queue(QUEUE_LOOPS, { connection: redis });
      this.notificationsQueue ??= new Queue(QUEUE_NOTIFICATIONS, { connection: redis });
      this.scheduledQueue ??= new Queue(QUEUE_SCHEDULED, { connection: redis });
      this.safetyQueue ??= new Queue(QUEUE_SAFETY, { connection: redis });
      return {
        media: this.mediaQueue,
        feed: this.feedQueue,
        moments: this.momentsQueue,
        loops: this.loopsQueue,
        notifications: this.notificationsQueue,
        scheduled: this.scheduledQueue,
        safety: this.safetyQueue,
      };
    } catch (err) {
      this.log.warn(
        `SOFT-FAIL: cannot enqueue jobs (${err instanceof Error ? err.message : 'error'}). Processing inline.`,
      );
      this.redisDisabled = true;
      return null;
    }
  }

  async processMedia(mediaId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.media.add(JOB_PROCESS_MEDIA, { mediaId } satisfies ProcessMediaJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
      });
      return;
    }
    this.log.warn({ mediaId }, 'INLINE_PROCESS: media job running in the API process (no worker/Redis).');
    await processMediaItem(this.prisma, this.storage.inner, mediaId, this.pino());
  }

  async fanout(postId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.feed.add(JOB_FANOUT_POST, { postId } satisfies FanoutPostJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 200,
      });
      return;
    }
    this.log.warn({ postId }, 'INLINE_PROCESS: feed fan-out running in the API process.');
    await fanoutPost(this.prisma, postId);
  }

  async retract(postId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.feed.add(JOB_RETRACT_POST, { postId } satisfies RetractPostJob);
      return;
    }
    await retractPost(this.prisma, postId);
  }

  async processLoop(postId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.loops.add(JOB_PROCESS_LOOP, { postId } satisfies ProcessLoopJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
      });
      return;
    }
    this.log.warn({ postId }, 'INLINE_PROCESS: loop compose running in the API process (no worker/Redis).');
    await processLoop(this.prisma, this.storage.inner, postId, this.pino());
  }

  async deliverNotification(notificationId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.notifications.add(
        JOB_DELIVER_NOTIFICATION,
        { notificationId } satisfies DeliverNotificationJob,
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200 },
      );
      return;
    }
    this.log.warn({ notificationId }, 'INLINE_PROCESS: notification delivery running in the API process.');
    await this.deliverFn?.(notificationId);
  }

  async runNotificationDigest(now?: Date): Promise<void> {
    await this.digestFn?.(now);
  }

  async expireDueMoments(): Promise<void> {
    const result = await expireMoments(this.prisma, this.storage.inner);
    if (result.scanned > 0) {
      this.log.log(
        `Expired ${result.scanned} Moments (kept ${result.kept}, archived ${result.archived}, deleted ${result.deleted}).`,
      );
    }
  }

  private async scheduleMomentExpiry(): Promise<void> {
    if (inlinePreferred()) {
      this.log.log('INLINE_PROCESS: Moment expiry runs on tray reads and tests, not a Redis repeatable job.');
      return;
    }
    const queued = await this.queues();
    if (queued) {
      await queued.moments.add(
        JOB_EXPIRE_MOMENTS,
        {} satisfies ExpireMomentsJob,
        {
          repeat: { every: 60_000 },
          removeOnComplete: 50,
        },
      );
      this.log.log('Scheduled tessera-moments expire job every 60s.');
      return;
    }
    this.log.warn('SOFT-FAIL: Redis down — Moment expiry runs inline every 60s in the API process.');
    this.inlineExpiry = setInterval(() => {
      void this.expireDueMoments().catch((err) =>
        this.log.warn(`INLINE_PROCESS: moment expiry failed (${err instanceof Error ? err.message : 'error'})`),
      );
    }, 60_000);
    this.inlineExpiry.unref();
  }

  private async scheduleNotificationDigest(): Promise<void> {
    if (inlinePreferred()) {
      this.log.log('INLINE_PROCESS: notification digest runs from tests, not a Redis repeatable job.');
      return;
    }
    const queued = await this.queues();
    if (queued) {
      await queued.notifications.add(JOB_NOTIFICATION_DIGEST, {} satisfies NotificationDigestJob, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: 20,
      });
      this.log.log('Scheduled tessera-notifications digest every 60m.');
      return;
    }
    this.log.warn('SOFT-FAIL: Redis down — notification digest runs inline every 60m in the API process.');
    this.inlineDigest = setInterval(() => {
      void this.runNotificationDigest().catch((err) =>
        this.log.warn(`INLINE_PROCESS: digest failed (${err instanceof Error ? err.message : 'error'})`),
      );
    }, 60 * 60 * 1000);
    this.inlineDigest.unref();
  }

  async publishDueScheduled(now?: Date): Promise<void> {
    const result = await publishDueScheduledPosts(this.prisma, now ?? new Date());
    for (const id of result.notificationIds) {
      await this.deliverNotification(id);
    }
    if (result.published > 0) {
      this.log.log(
        `Published ${result.published} scheduled posts (${result.waitingOnMedia} still waiting on media).`,
      );
    }
  }

  private async scheduleScheduledPublish(): Promise<void> {
    if (inlinePreferred()) {
      this.log.log('INLINE_PROCESS: scheduled posts publish from tests, not a Redis repeatable job.');
      if (process.env.NODE_ENV === 'test') return;
    }
    const queued = await this.queues();
    if (queued) {
      await queued.scheduled.add(JOB_PUBLISH_SCHEDULED, {} satisfies PublishScheduledJob, {
        repeat: { every: 30_000 },
        removeOnComplete: 50,
      });
      this.log.log('Scheduled tessera-scheduled publish job every 30s.');
      return;
    }
    this.log.warn('SOFT-FAIL: Redis down — scheduled posts publish inline every 30s in the API process.');
    this.inlineScheduled = setInterval(() => {
      void this.publishDueScheduled().catch((err) =>
        this.log.warn(`INLINE_PROCESS: scheduled publish failed (${err instanceof Error ? err.message : 'error'})`),
      );
    }, 30_000);
    this.inlineScheduled.unref();
  }

  async exportAccount(jobId: string): Promise<void> {
    const queued = await this.queues();
    if (queued) {
      await queued.safety.add(JOB_EXPORT_ACCOUNT, { jobId } satisfies ExportAccountJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
      });
      return;
    }
    this.log.warn({ jobId }, 'INLINE_PROCESS: account export running in the API process.');
    await this.runExport(jobId);
  }

  async runExport(jobId: string): Promise<void> {
    await runExportJob(
      this.prisma,
      this.storage.inner,
      jobId,
      (key) => this.storage.signGet(key),
      {
        sendExportReady: (to, downloadUrl) => this.mail.sendExportReady(to, downloadUrl),
      },
      this.pino(),
    );
  }

  async runHardDelete(now?: Date): Promise<void> {
    const result = await hardDeleteDueAccounts(this.prisma, this.storage.inner, now ?? new Date(), this.pino());
    if (result.deleted > 0) {
      this.log.log(`Hard-deleted ${result.deleted} accounts after the 30-day grace.`);
    }
  }

  private async scheduleHardDelete(): Promise<void> {
    if (inlinePreferred()) {
      this.log.log('INLINE_PROCESS: account hard-delete runs from tests, not a Redis repeatable job.');
      return;
    }
    const queued = await this.queues();
    if (queued) {
      await queued.safety.add(JOB_HARD_DELETE, {} satisfies HardDeleteJob, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: 20,
      });
      this.log.log('Scheduled tessera-safety hard-delete every 60m.');
      return;
    }
    this.log.warn('SOFT-FAIL: Redis down — hard-delete runs inline every 60m in the API process.');
    this.inlineHardDelete = setInterval(() => {
      void this.runHardDelete().catch((err) =>
        this.log.warn(`INLINE_PROCESS: hard-delete failed (${err instanceof Error ? err.message : 'error'})`),
      );
    }, 60 * 60 * 1000);
    this.inlineHardDelete.unref();
  }

  private async scheduleIdempotencyPurge(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      this.log.log('INLINE_PROCESS: idempotency purge runs from tests, not a Redis repeatable job.');
      return;
    }
    const queued = await this.queues();
    if (queued) {
      await queued.safety.add(JOB_PURGE_IDEMPOTENCY, {} satisfies PurgeIdempotencyJob, {
        repeat: { every: 60 * 60 * 1000 },
        removeOnComplete: 20,
      });
      this.log.log('Scheduled tessera-safety idempotency purge every 60m.');
      return;
    }
    this.log.warn('SOFT-FAIL: Redis down — idempotency purge runs inline every 60m in the API process.');
    this.inlineIdempotencyPurge = setInterval(() => {
      void purgeIdempotencyRecords(this.prisma).catch((err) =>
        this.log.warn(`INLINE_PROCESS: idempotency purge failed (${err instanceof Error ? err.message : 'error'})`),
      );
    }, 60 * 60 * 1000);
    this.inlineIdempotencyPurge.unref();
  }

  private pino() {
    return {
      info: (obj: object, msg: string) => this.log.log({ ...obj, msg }),
      warn: (obj: object, msg: string) => this.log.warn({ ...obj, msg }),
      error: (obj: object, msg: string) => this.log.error({ ...obj, msg }),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.inlineExpiry) clearInterval(this.inlineExpiry);
    if (this.inlineDigest) clearInterval(this.inlineDigest);
    if (this.inlineScheduled) clearInterval(this.inlineScheduled);
    if (this.inlineHardDelete) clearInterval(this.inlineHardDelete);
    if (this.inlineIdempotencyPurge) clearInterval(this.inlineIdempotencyPurge);
    await this.mediaQueue?.close();
    await this.feedQueue?.close();
    await this.momentsQueue?.close();
    await this.loopsQueue?.close();
    await this.notificationsQueue?.close();
    await this.scheduledQueue?.close();
    await this.safetyQueue?.close();
    this.redis?.disconnect();
  }
}

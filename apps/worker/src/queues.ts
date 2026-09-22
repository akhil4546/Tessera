import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
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
  createObjectStorage,
  deliverNotificationRecord,
  expireMoments,
  fanoutPost,
  hardDeleteDueAccounts,
  purgeIdempotencyRecords,
  runExportJob,
  processLoop,
  processMediaItem,
  publishDueScheduledPosts,
  retractPost,
  sendNotificationDigests,
  sendWebPush,
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
import { createPrismaClient } from '@tessera/db';
import { logger } from './logger.js';

export function startWorkers(): { close: () => Promise<void> } {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  connection.on('error', (err) => {
    logger.warn({ err }, 'SOFT-FAIL: Redis worker connection error');
  });
  const prisma = createPrismaClient();
  const storage = createObjectStorage();
  const log = {
    info: (obj: object, msg: string) => logger.info(obj, msg),
    warn: (obj: object, msg: string) => logger.warn(obj, msg),
    error: (obj: object, msg: string) => logger.error(obj, msg),
  };

  const media = new Worker(
    QUEUE_MEDIA,
    async (job) => {
      if (job.name === JOB_PROCESS_MEDIA) {
        const data = job.data as ProcessMediaJob;
        await processMediaItem(prisma, storage, data.mediaId, log);
      }
    },
    { connection, concurrency: 2 },
  );

  const feed = new Worker(
    QUEUE_FEED,
    async (job) => {
      if (job.name === JOB_FANOUT_POST) {
        await fanoutPost(prisma, (job.data as FanoutPostJob).postId);
      }
      if (job.name === JOB_RETRACT_POST) {
        await retractPost(prisma, (job.data as RetractPostJob).postId);
      }
    },
    { connection, concurrency: 4 },
  );

  const moments = new Worker(
    QUEUE_MOMENTS,
    async (job) => {
      if (job.name === JOB_EXPIRE_MOMENTS) {
        const data = job.data as ExpireMomentsJob;
        const now = data.now ? new Date(data.now) : new Date();
        const result = await expireMoments(prisma, storage, now);
        logger.info(result, 'Moment expiry job finished');
      }
    },
    { connection, concurrency: 1 },
  );

  const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  const from = process.env.SMTP_FROM ?? 'Tessera <noreply@localhost>';
  const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  async function sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    try {
      await mailer.sendMail({ from, ...options });
      return true;
    } catch (err) {
      logger.warn({ err }, 'SOFT-FAIL: worker email not sent');
      return false;
    }
  }

  const notifications = new Worker(
    QUEUE_NOTIFICATIONS,
    async (job) => {
      if (job.name === JOB_DELIVER_NOTIFICATION) {
        const data = job.data as DeliverNotificationJob;
        await deliverNotificationRecord(prisma, data.notificationId, {
          mail: {
            sendActivity: async (to, subject, body, href) => {
              const url = href ? `${web}${href}` : web;
              return sendMail({
                to,
                subject,
                text: `${body}\n\n${url}\n`,
                html: `<p>${body}</p><p><a href="${url}">Open in Tessera</a></p>`,
              });
            },
            sendSecurity: async (to, body) =>
              sendMail({
                to,
                subject: 'Tessera security alert',
                text: `${body}\n\n${web}/settings/security\n`,
                html: `<p>${body}</p><p><a href="${web}/settings/security">Review security settings</a></p>`,
              }),
          },
          sendWebPush,
          log,
        });
      }
      if (job.name === JOB_NOTIFICATION_DIGEST) {
        const data = job.data as NotificationDigestJob;
        const now = data.now ? new Date(data.now) : new Date();
        const result = await sendNotificationDigests(
          prisma,
          now,
          async (to, lines) =>
            sendMail({
              to,
              subject: 'Your Tessera Inbox digest',
              text: `Here is what you missed:\n\n${lines.map((line) => `• ${line}`).join('\n')}\n\n${web}/inbox\n`,
              html: `<p>Here is what you missed:</p><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`,
            }),
          log,
        );
        logger.info(result, 'Notification digest job finished');
      }
    },
    { connection, concurrency: 4 },
  );

  const scheduled = new Worker(
    QUEUE_SCHEDULED,
    async (job) => {
      if (job.name === JOB_PUBLISH_SCHEDULED) {
        const data = job.data as PublishScheduledJob;
        const now = data.now ? new Date(data.now) : new Date();
        const result = await publishDueScheduledPosts(prisma, now);
        for (const notificationId of result.notificationIds) {
          await deliverNotificationRecord(prisma, notificationId, {
            mail: {
              sendActivity: async (to, subject, body, href) => {
                const url = href ? `${web}${href}` : web;
                return sendMail({
                  to,
                  subject,
                  text: `${body}\n\n${url}\n`,
                  html: `<p>${body}</p><p><a href="${url}">Open in Tessera</a></p>`,
                });
              },
              sendSecurity: async (to, body) =>
                sendMail({
                  to,
                  subject: 'Tessera security alert',
                  text: `${body}\n\n${web}/settings/security\n`,
                  html: `<p>${body}</p><p><a href="${web}/settings/security">Review security settings</a></p>`,
                }),
            },
            sendWebPush,
            log,
          });
        }
        logger.info(result, 'Scheduled publish job finished');
      }
    },
    { connection, concurrency: 1 },
  );

  const safety = new Worker(
    QUEUE_SAFETY,
    async (job) => {
      if (job.name === JOB_EXPORT_ACCOUNT) {
        const data = job.data as ExportAccountJob;
        await runExportJob(
          prisma,
          storage,
          data.jobId,
          (key) => storage.signGet(key, 7 * 24 * 60 * 60),
          {
            sendExportReady: async (to, downloadUrl) =>
              sendMail({
                to,
                subject: 'Your Tessera data export is ready',
                text: `Your archive is ready (JSON plus media). It expires in 7 days:\n${downloadUrl}\n`,
                html: `<p>Your archive is ready (JSON plus media). It expires in 7 days.</p><p><a href="${downloadUrl}">Download export</a></p>`,
              }),
          },
          log,
        );
      }
      if (job.name === JOB_HARD_DELETE) {
        const data = job.data as HardDeleteJob;
        const now = data.now ? new Date(data.now) : new Date();
        const result = await hardDeleteDueAccounts(prisma, storage, now, log);
        logger.info(result, 'Hard-delete job finished');
      }
      if (job.name === JOB_PURGE_IDEMPOTENCY) {
        const data = job.data as PurgeIdempotencyJob;
        const now = data.now ? new Date(data.now) : new Date();
        const result = await purgeIdempotencyRecords(prisma, now);
        logger.info(result, 'Idempotency purge finished');
      }
    },
    { connection, concurrency: 1 },
  );

  const loops = new Worker(
    QUEUE_LOOPS,
    async (job) => {
      if (job.name === JOB_PROCESS_LOOP) {
        await processLoop(prisma, storage, (job.data as ProcessLoopJob).postId, log);
      }
    },
    { connection, concurrency: 1 },
  );

  media.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'media job failed'));
  feed.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'feed job failed'));
  moments.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'moments job failed'));
  loops.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'loops job failed'));
  notifications.on('failed', (job, err) =>
    logger.error({ err, id: job?.id }, 'notifications job failed'),
  );
  scheduled.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'scheduled job failed'));
  safety.on('failed', (job, err) => logger.error({ err, id: job?.id }, 'safety job failed'));
  logger.info(
    'BullMQ workers registered: tessera-media, tessera-feed, tessera-moments, tessera-loops, tessera-notifications, tessera-scheduled, tessera-safety',
  );

  return {
    async close() {
      await media.close();
      await feed.close();
      await moments.close();
      await loops.close();
      await notifications.close();
      await scheduled.close();
      await safety.close();
      connection.disconnect();
      await prisma.$disconnect();
    },
  };
}

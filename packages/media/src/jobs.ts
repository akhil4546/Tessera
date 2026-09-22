import { FEED_FANOUT_FOLLOWER_THRESHOLD } from '@tessera/types';

export const QUEUE_MEDIA = 'tessera-media';
export const QUEUE_FEED = 'tessera-feed';
export const QUEUE_MOMENTS = 'tessera-moments';
export const QUEUE_LOOPS = 'tessera-loops';
export const QUEUE_SEARCH = 'tessera-search';
export const QUEUE_NOTIFICATIONS = 'tessera-notifications';
export const QUEUE_SCHEDULED = 'tessera-scheduled';
export const QUEUE_SAFETY = 'tessera-safety';

export const JOB_PROCESS_MEDIA = 'process-media';
export const JOB_FANOUT_POST = 'fanout-post';
export const JOB_RETRACT_POST = 'retract-post';
export const JOB_EXPIRE_MOMENTS = 'expire-moments';
export const JOB_PROCESS_LOOP = 'process-loop';
export const JOB_INDEX_SEARCH = 'index-search';
export const JOB_DELIVER_NOTIFICATION = 'deliver-notification';
export const JOB_NOTIFICATION_DIGEST = 'notification-digest';
export const JOB_PUBLISH_SCHEDULED = 'publish-scheduled';
export const JOB_EXPORT_ACCOUNT = 'export-account';
export const JOB_HARD_DELETE = 'hard-delete';
export const JOB_PURGE_IDEMPOTENCY = 'purge-idempotency';

export { FEED_FANOUT_FOLLOWER_THRESHOLD };

export type ProcessMediaJob = { mediaId: string };
export type FanoutPostJob = { postId: string };
export type RetractPostJob = { postId: string };
export type ExpireMomentsJob = { now?: string };
export type ProcessLoopJob = { postId: string };
export type SearchIndexKind = 'post' | 'user' | 'hashtag' | 'place' | 'board';
export type IndexSearchJob = { kind: SearchIndexKind; id: string };
export type DeliverNotificationJob = { notificationId: string };
export type NotificationDigestJob = { now?: string };
export type PublishScheduledJob = { now?: string };
export type ExportAccountJob = { jobId: string };
export type HardDeleteJob = { now?: string };
export type PurgeIdempotencyJob = { now?: string };

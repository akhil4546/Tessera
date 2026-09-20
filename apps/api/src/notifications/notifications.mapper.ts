import {
  activityHref,
  formatActivityCopy,
  parseActorIds,
} from '@tessera/media';
import type {
  AuthorPreview,
  NotificationKind,
  NotificationView,
  SecurityAlertKind,
} from '@tessera/types';

export function toNotificationView(input: {
  id: string;
  kind: NotificationKind;
  actorIds: unknown;
  actorCount: number;
  targetType: string | null;
  targetId: string | null;
  preview: string | null;
  href: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  actors: AuthorPreview[];
}): NotificationView {
  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : {};
  const securityKind = payload.securityKind as SecurityAlertKind | undefined;
  const ids = parseActorIds(input.actorIds);
  const actors = input.actors.filter((actor) => ids.includes(actor.id));
  actors.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return {
    id: input.id,
    kind: input.kind,
    body: formatActivityCopy({
      kind: input.kind,
      actors,
      actorCount: input.actorCount,
      securityKind: securityKind ?? null,
    }),
    actors,
    actorCount: input.actorCount,
    targetType: input.targetType,
    targetId: input.targetId,
    preview: input.preview,
    href:
      input.href ??
      activityHref({
        kind: input.kind,
        targetId: input.kind === 'reply' || input.kind === 'comment' || input.kind === 'mention' || input.kind === 'tag' || input.kind === 'appreciation'
          ? (typeof payload.postId === 'string' ? payload.postId : input.targetId)
          : input.targetId,
        actorHandle: actors[0]?.handle ?? null,
      }),
    readAt: input.readAt?.toISOString() ?? null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

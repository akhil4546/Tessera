export type PostVisibility = 'public' | 'followers' | 'circles';

export function canViewPost(input: {
  authorId: string;
  viewerId?: string;
  visibility: PostVisibility;
  authorPrivate: boolean;
  viewerFollowsAuthor: boolean;
  blockedEitherWay: boolean;
  published: boolean;
  deleted: boolean;
  archived: boolean;
  takenDown?: boolean;
  viewerInAuthorCircle?: boolean;
}): boolean {
  if (input.takenDown && input.viewerId !== input.authorId) return false;
  if (input.deleted || !input.published) return Boolean(input.viewerId && input.viewerId === input.authorId);
  if (input.archived && input.viewerId !== input.authorId) return false;
  if (input.blockedEitherWay) return false;
  if (input.viewerId === input.authorId) return true;
  if (input.visibility === 'circles') return Boolean(input.viewerInAuthorCircle);
  if (input.authorPrivate && !input.viewerFollowsAuthor) return false;
  if (input.visibility === 'followers') return input.viewerFollowsAuthor;
  return true;
}

export function muteHidesPosts(scope: 'posts' | 'moments' | 'both' | null | undefined): boolean {
  return scope === 'posts' || scope === 'both';
}

export { muteHidesMoments } from './moments.ts';

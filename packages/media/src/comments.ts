export function commentIsReplyAllowed(parent: { parentId: string | null } | null): boolean {
  if (!parent) return false;
  return parent.parentId === null;
}

export const MAX_PINNED_COMMENTS = 3;

export function keywordHidden(body: string, keywords: string[]): boolean {
  const hay = body.toLowerCase();
  return keywords.some((keyword) => keyword.trim().length > 0 && hay.includes(keyword.trim().toLowerCase()));
}

/** Restricted comments stay visible to the author and the commenter until approved. */
export function restrictCommentHiddenFrom(input: {
  hiddenByRestrict: boolean;
  viewerId?: string;
  postAuthorId: string;
  commentAuthorId: string;
}): boolean {
  if (!input.hiddenByRestrict) return false;
  if (!input.viewerId) return true;
  if (input.viewerId === input.postAuthorId) return false;
  if (input.viewerId === input.commentAuthorId) return false;
  return true;
}

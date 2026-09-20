import { describe, expect, it } from 'vitest';
import { canViewPost, muteHidesPosts } from './visibility.ts';

describe('canViewPost', () => {
  const base = {
    authorId: 'a',
    visibility: 'public' as const,
    authorPrivate: false,
    viewerFollowsAuthor: false,
    blockedEitherWay: false,
    published: true,
    deleted: false,
    archived: false,
  };

  it('hides blocked and unpublished posts from others', () => {
    expect(canViewPost({ ...base, viewerId: 'b', blockedEitherWay: true })).toBe(false);
    expect(canViewPost({ ...base, viewerId: 'b', published: false })).toBe(false);
    expect(canViewPost({ ...base, viewerId: 'a', published: false })).toBe(true);
  });

  it('requires a follow for followers-only and private authors', () => {
    expect(canViewPost({ ...base, viewerId: 'b', visibility: 'followers' })).toBe(false);
    expect(canViewPost({ ...base, viewerId: 'b', visibility: 'followers', viewerFollowsAuthor: true })).toBe(true);
    expect(canViewPost({ ...base, viewerId: 'b', authorPrivate: true })).toBe(false);
  });

  it('hides taken-down posts from everyone except the author', () => {
    expect(canViewPost({ ...base, viewerId: 'b', takenDown: true })).toBe(false);
    expect(canViewPost({ ...base, viewerId: 'a', takenDown: true })).toBe(true);
  });

  it('requires Circle membership for circles visibility, even if the viewer follows', () => {
    expect(canViewPost({ ...base, viewerId: 'b', visibility: 'circles', viewerFollowsAuthor: true })).toBe(false);
    expect(
      canViewPost({
        ...base,
        viewerId: 'b',
        visibility: 'circles',
        viewerFollowsAuthor: false,
        viewerInAuthorCircle: true,
      }),
    ).toBe(true);
  });
});

describe('muteHidesPosts', () => {
  it('hides posts for posts/both, not moments-only', () => {
    expect(muteHidesPosts('moments')).toBe(false);
    expect(muteHidesPosts('posts')).toBe(true);
    expect(muteHidesPosts('both')).toBe(true);
  });
});

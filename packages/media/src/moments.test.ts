import { describe, expect, it } from 'vitest';
import {
  canKeepMoment,
  canViewMoment,
  clampStillDuration,
  expiryAction,
  isQuickEmoji,
  linkStickerAllowed,
  momentExpiresAt,
  muteHidesMoments,
  orderMomentTray,
  trayInteractionBoostMs,
} from './moments.ts';

describe('moment lifetime', () => {
  it('expires 24 hours after publish', () => {
    const published = new Date('2026-09-17T12:00:00.000Z');
    expect(momentExpiresAt(published).toISOString()).toBe('2026-09-18T12:00:00.000Z');
  });

  it('clamps still durations to 1–15 seconds', () => {
    expect(clampStillDuration(200)).toBe(1000);
    expect(clampStillDuration(20_000)).toBe(15_000);
    expect(clampStillDuration(undefined)).toBe(5000);
  });
});

describe('canViewMoment', () => {
  const base = {
    authorId: 'a',
    visibility: 'public' as const,
    authorPrivate: false,
    viewerFollowsAuthor: false,
    blockedEitherWay: false,
    published: true,
    deleted: false,
    expired: false,
    keptVisible: false,
    archiveForAuthor: false,
  };

  it('hides expired Moments unless Kept or archived for the author', () => {
    expect(canViewMoment({ ...base, viewerId: 'b', expired: true })).toBe(false);
    expect(canViewMoment({ ...base, viewerId: 'b', expired: true, keptVisible: true })).toBe(true);
    expect(canViewMoment({ ...base, viewerId: 'a', expired: true })).toBe(false);
    expect(canViewMoment({ ...base, viewerId: 'a', expired: true, archiveForAuthor: true })).toBe(true);
  });

  it('respects followers-only, private authors, and blocks', () => {
    expect(canViewMoment({ ...base, viewerId: 'b', visibility: 'followers' })).toBe(false);
    expect(canViewMoment({ ...base, viewerId: 'b', visibility: 'followers', viewerFollowsAuthor: true })).toBe(true);
    expect(canViewMoment({ ...base, viewerId: 'b', blockedEitherWay: true })).toBe(false);
  });
});

describe('mute and keep', () => {
  it('hides Moments for moments/both, not posts-only', () => {
    expect(muteHidesMoments('posts')).toBe(false);
    expect(muteHidesMoments('moments')).toBe(true);
    expect(muteHidesMoments('both')).toBe(true);
  });

  it('only Keeps a live, unexpired Moment', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    expect(
      canKeepMoment({
        now,
        publishedAt: now,
        expiresAt: new Date('2026-09-18T12:00:00.000Z'),
        expiredAt: null,
        deletedAt: null,
      }),
    ).toBe(true);
    expect(
      canKeepMoment({
        now,
        publishedAt: now,
        expiresAt: new Date('2026-09-17T11:00:00.000Z'),
        expiredAt: null,
        deletedAt: null,
      }),
    ).toBe(false);
  });

  it('prefers Keep, then archive, then delete on expiry', () => {
    expect(expiryAction({ kept: true, archiveEnabled: true })).toBe('keep');
    expect(expiryAction({ kept: false, archiveEnabled: true })).toBe('archive');
    expect(expiryAction({ kept: false, archiveEnabled: false })).toBe('delete');
  });
});

describe('stickers and tray', () => {
  it('reserves link stickers for creator and business accounts', () => {
    expect(linkStickerAllowed('personal')).toBe(false);
    expect(linkStickerAllowed('creator')).toBe(true);
  });

  it('only accepts Tessera quick emojis', () => {
    expect(isQuickEmoji('✨')).toBe(true);
    expect(isQuickEmoji('❤️')).toBe(false);
  });

  it('puts own ring first, then unseen, then recency plus interaction', () => {
    const ordered = orderMomentTray([
      { authorId: 'seen', isSelf: false, unseen: false, latestAt: 300, interactionBoostMs: 0 },
      { authorId: 'boosted', isSelf: false, unseen: true, latestAt: 100, interactionBoostMs: 250 },
      { authorId: 'me', isSelf: true, unseen: false, latestAt: 10, interactionBoostMs: 0 },
      { authorId: 'fresh', isSelf: false, unseen: true, latestAt: 200, interactionBoostMs: 0 },
    ]);
    expect(ordered.map((row) => row.authorId)).toEqual(['me', 'boosted', 'fresh', 'seen']);
  });

  it('adds interaction hours, not a secret score', () => {
    expect(
      trayInteractionBoostMs({
        appreciatedRecently: true,
        commentedRecently: false,
        viewedMomentsRecently: true,
      }),
    ).toBe(18 * 60 * 60 * 1000);
  });
});

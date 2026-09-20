'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicProfile } from '@tessera/types';
import { Button, EmptyState, Tile } from '@tessera/ui';
import { api } from '../lib/api';
import { MemoryMap } from './memory-map';
import { MosaicGrid } from './mosaic-grid';
import { ReelShelves } from './reel-shelves';
import { mediaSrc } from '../lib/media';
import { ReportDialog } from './report-dialog';

export function ProfileCard({
  profile,
  isSelf,
}: {
  profile: PublicProfile;
  isSelf?: boolean;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const self = isSelf ?? profile.viewer.isSelf;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['profile', profile.handle] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const follow = useMutation({
    mutationFn: async () => {
      if (profile.viewer.followStatus === 'none') return api.follow(profile.handle);
      return api.unfollow(profile.handle);
    },
    onSuccess: invalidate,
  });
  const block = useMutation({
    mutationFn: async () => {
      if (profile.viewer.blockedByMe) return api.unblock(profile.handle);
      return api.block(profile.handle);
    },
    onSuccess: invalidate,
  });
  const restrict = useMutation({
    mutationFn: async () => {
      if (profile.viewer.restrictedByMe) return api.unrestrict(profile.handle);
      return api.restrict(profile.handle);
    },
    onSuccess: invalidate,
  });
  const mute = useMutation({
    mutationFn: async () => {
      if (profile.viewer.mutedByMe) return api.unmute(profile.handle);
      return api.mute(profile.handle, 'both');
    },
    onSuccess: invalidate,
  });

  const mosaic = useQuery({
    queryKey: ['mosaic', profile.handle],
    queryFn: () => api.mosaic(profile.handle),
  });

  const followLabel =
    profile.viewer.followStatus === 'accepted'
      ? t('profile.following')
      : profile.viewer.followStatus === 'pending'
        ? t('profile.requested')
        : t('profile.follow');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Tile>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            {profile.avatarUrl ? (
              <img
                src={mediaSrc(profile.avatarUrl)}
                alt=""
                className="size-20 rounded-tile object-cover"
              />
            ) : null}
            <div>
            <h1 className="font-display text-3xl font-semibold text-text-primary">{profile.displayName}</h1>
            <p className="text-text-secondary">@{profile.handle}</p>
            {profile.isPrivate ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate">
                {t('profile.private')}
              </p>
            ) : null}
            {profile.pronouns ? <p className="mt-2 text-sm text-text-secondary">{profile.pronouns}</p> : null}
            {profile.bio ? <p className="mt-3 max-w-xl text-text-primary">{profile.bio}</p> : null}
            {profile.links.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-3 text-sm">
                {profile.links.map((link) => (
                  <li key={link.url}>
                    <a className="text-accent underline" href={link.url} rel="noreferrer" target="_blank">
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 text-sm text-text-secondary">
              {profile.counts.followers} {t('profile.followers')} · {profile.counts.following} {t('profile.follows')}
              {typeof profile.counts.posts === 'number' ? ` · ${profile.counts.posts}` : ''}
            </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {self ? (
              <Button variant="secondary" asChild>
                <Link href="/settings">{t('profile.edit')}</Link>
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant={profile.viewer.following ? 'secondary' : 'primary'}
                  onClick={() => follow.mutate()}
                  disabled={follow.isPending}
                >
                  {followLabel}
                </Button>
                <Button type="button" variant="ghost" onClick={() => mute.mutate()} disabled={mute.isPending}>
                  {profile.viewer.mutedByMe ? t('profile.unmute') : t('profile.mute')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => restrict.mutate()} disabled={restrict.isPending}>
                  {profile.viewer.restrictedByMe ? t('settings.unrestrict') : t('settings.restrict')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => block.mutate()} disabled={block.isPending}>
                  {profile.viewer.blockedByMe ? t('profile.unblock') : t('profile.block')}
                </Button>
                <ReportDialog kind="account" handle={profile.handle} />
              </>
            )}
          </div>
        </div>
      </Tile>
      <ReelShelves handle={profile.handle} isSelf={self} />
      {profile.memoryMapEnabled || self ? <MemoryMap handle={profile.handle} /> : null}
      {mosaic.data ? <MosaicGrid mosaic={mosaic.data} isSelf={self} /> : <EmptyState title={t('empty.mosaic.title')} body={t('empty.mosaic.body')} />}
    </div>
  );
}

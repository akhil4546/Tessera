'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextArea, TextField, Tile } from '@tessera/ui';
import { api } from '../../lib/api';

export default function SettingsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
  });
  const wellbeing = useQuery({
    queryKey: ['wellbeing'],
    queryFn: () => api.getWellbeing(),
    enabled: Boolean(me.data),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [handle, setHandle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [memoryMapEnabled, setMemoryMapEnabled] = useState(true);
  const [momentArchiveEnabled, setMomentArchiveEnabled] = useState(false);
  const [loopsBudgetMinutes, setLoopsBudgetMinutes] = useState<number | null>(null);
  const [defaultAppreciation, setDefaultAppreciation] = useState<
    'inspiring' | 'funny' | 'love' | 'useful'
  >('love');
  const [activityStatusEnabled, setActivityStatusEnabled] = useState(true);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [whoCanMessage, setWhoCanMessage] = useState<'everyone' | 'followers' | 'nobody'>(
    'everyone',
  );
  const profile = me.data;
  const [seenProfile, setSeenProfile] = useState(profile);
  if (profile && profile !== seenProfile) {
    setSeenProfile(profile);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setPronouns(profile.pronouns ?? '');
    setHandle(profile.handle);
    setIsPrivate(profile.isPrivate);
    setMemoryMapEnabled(profile.memoryMapEnabled ?? true);
    setMomentArchiveEnabled(profile.momentArchiveEnabled ?? false);
    setDefaultAppreciation(profile.defaultAppreciation ?? 'love');
    setActivityStatusEnabled(profile.activityStatusEnabled ?? true);
    setReadReceiptsEnabled(profile.readReceiptsEnabled ?? true);
    setWhoCanMessage(profile.whoCanMessage ?? 'everyone');
  }
  const budget = wellbeing.data;
  const [seenBudget, setSeenBudget] = useState(budget);
  if (budget && budget !== seenBudget) {
    setSeenBudget(budget);
    setLoopsBudgetMinutes(budget.loopsBudgetMinutes);
  }

  const save = useMutation({
    mutationFn: async () => {
      await api.updateMe({
        displayName,
        bio,
        pronouns: pronouns || null,
        defaultAppreciation,
        momentArchiveEnabled,
        memoryMapEnabled,
        activityStatusEnabled,
        readReceiptsEnabled,
        whoCanMessage,
      });
      if (me.data && handle !== me.data.handle) {
        await api.updateHandle(handle);
      }
      if (me.data && isPrivate !== me.data.isPrivate) {
        await api.updatePrivacy(isPrivate);
      }
      await api.setWellbeing({ loopsBudgetMinutes });
    },
    onSuccess: async () => {
      setMessage('Saved.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['wellbeing'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    },
  });

  if (me.isError) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }
  if (!me.data) return <p className="text-text-secondary">{t('common.loading')}</p>;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('settings.title')}
      </p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/settings/security">
          {t('settings.security')}
        </Link>
        <Link className="underline" href="/settings/sessions">
          {t('settings.sessions')}
        </Link>
        <Link className="underline" href="/settings/requests">
          {t('profile.requests')}
        </Link>
        <Link className="underline" href="/discover/tune">
          {t('settings.discoverTune')}
        </Link>
        <Link className="underline" href="/settings/circles">
          {t('settings.circles')}
        </Link>
        <Link className="underline" href="/boards">
          {t('settings.boards')}
        </Link>
        <Link className="underline" href="/drafts">
          {t('settings.drafts')}
        </Link>
        <Link className="underline" href="/settings/notifications">
          {t('settings.notifications')}
        </Link>
        <Link className="underline" href="/settings/safety">
          {t('settings.safety')}
        </Link>
      </nav>
      <Tile>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <TextField
            name="displayName"
            label={t('auth.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <TextField
            name="handle"
            label={t('auth.handle')}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            hint={t('settings.handleHint')}
          />
          <TextArea
            name="bio"
            label={t('settings.bio')}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
          />
          <TextField
            name="pronouns"
            label={t('settings.pronouns')}
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
          />
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">Default Appreciation (double-tap)</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={defaultAppreciation}
              onChange={(e) => setDefaultAppreciation(e.target.value as typeof defaultAppreciation)}
            >
              <option value="inspiring">{t('appreciation.inspiring')}</option>
              <option value="funny">{t('appreciation.funny')}</option>
              <option value="love">{t('appreciation.love')}</option>
              <option value="useful">{t('appreciation.useful')}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.privateLabel')}</span>
              <span className="block text-text-secondary">{t('settings.privateHint')}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={memoryMapEnabled}
              onChange={(e) => setMemoryMapEnabled(e.target.checked)}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.memoryMap')}</span>
              <span className="block text-text-secondary">{t('settings.memoryMapHint')}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={momentArchiveEnabled}
              onChange={(e) => setMomentArchiveEnabled(e.target.checked)}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.momentArchive')}</span>
              <span className="block text-text-secondary">{t('settings.momentArchiveHint')}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={activityStatusEnabled}
              onChange={(e) => setActivityStatusEnabled(e.target.checked)}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.activityStatus')}</span>
              <span className="block text-text-secondary">{t('settings.activityStatusHint')}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={readReceiptsEnabled}
              onChange={(e) => setReadReceiptsEnabled(e.target.checked)}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.readReceipts')}</span>
              <span className="block text-text-secondary">{t('settings.readReceiptsHint')}</span>
            </span>
          </label>
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">{t('settings.whoCanMessage')}</span>
            <span className="text-text-secondary">{t('settings.whoCanMessageHint')}</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={whoCanMessage}
              onChange={(e) => setWhoCanMessage(e.target.value as typeof whoCanMessage)}
            >
              <option value="everyone">{t('settings.whoCanMessageEveryone')}</option>
              <option value="followers">{t('settings.whoCanMessageFollowers')}</option>
              <option value="nobody">{t('settings.whoCanMessageNobody')}</option>
            </select>
          </label>
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">{t('settings.loopsBudget')}</span>
            <span className="text-text-secondary">{t('settings.loopsBudgetHint')}</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={loopsBudgetMinutes ?? ''}
              onChange={(e) =>
                setLoopsBudgetMinutes(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">{t('settings.loopsBudgetOff')}</option>
              {[15, 30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} {t('settings.loopsBudgetMinutes')}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-moss">{message}</p> : null}
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Tile>
    </div>
  );
}

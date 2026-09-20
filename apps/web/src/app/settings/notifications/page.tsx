'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import type { ChannelPref, NotificationKind, NotificationPreferences } from '@tessera/types';
import { NOTIFICATION_KINDS } from '@tessera/types';
import { Button, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';
import { enableWebPush, webPushStatus } from '../../../lib/web-push';

const KIND_LABEL: Record<NotificationKind, string> = {
  new_follower: 'settings.kindNewFollower',
  follow_request: 'settings.kindFollowRequest',
  appreciation: 'settings.kindAppreciation',
  comment: 'settings.kindComment',
  reply: 'settings.kindReply',
  mention: 'settings.kindMention',
  tag: 'settings.kindTag',
  moment_reaction: 'settings.kindMomentReaction',
  board_invite: 'settings.kindBoardInvite',
  scheduled_post_published: 'settings.kindScheduled',
  security_alert: 'settings.kindSecurity',
};

function minutesToInput(minutes: number): string {
  const hour = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const min = (minutes % 60).toString().padStart(2, '0');
  return `${hour}:${min}`;
}

function inputToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export default function NotificationSettingsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const prefs = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.getNotificationPreferences(),
  });
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => {
    if (prefs.data) setDraft(prefs.data);
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await api.setNotificationPreferences({
        channels: draft.channels,
        quietHoursEnabled: draft.quietHoursEnabled,
        quietHoursStartMinutes: draft.quietHoursStartMinutes,
        quietHoursEndMinutes: draft.quietHoursEndMinutes,
        timezone: draft.timezone,
        emailDigest: draft.emailDigest,
      });
    },
    onSuccess: async () => {
      setMessage('Saved.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    },
  });

  if (prefs.isError) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }
  if (!draft) return <p className="text-text-secondary">{t('common.loading')}</p>;

  function setChannel(kind: NotificationKind, key: keyof ChannelPref, value: boolean) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        channels: {
          ...current.channels,
          [kind]: { ...current.channels[kind], [key]: value },
        },
      };
    });
  }

  async function onPush() {
    try {
      const result = await enableWebPush();
      setPushNote(result);
      setError(null);
    } catch (err) {
      setPushNote(null);
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('common.phase')} · {t('settings.notifications')}
      </p>
      <h1 className="font-display text-3xl font-semibold">{t('settings.notifications')}</h1>
      <p className="text-sm text-text-secondary">{t('settings.notificationsHint')}</p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/settings">
          {t('settings.title')}
        </Link>
      </nav>
      <Tile>
        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.quietHoursEnabled}
              onChange={(e) => setDraft({ ...draft, quietHoursEnabled: e.target.checked })}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.quietHours')}</span>
              <span className="block text-text-secondary">{t('settings.quietHoursHint')}</span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-h-11 flex-col gap-1 text-sm">
              <span className="font-medium">{t('settings.quietStart')}</span>
              <input
                type="time"
                className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
                value={minutesToInput(draft.quietHoursStartMinutes)}
                onChange={(e) => setDraft({ ...draft, quietHoursStartMinutes: inputToMinutes(e.target.value) })}
              />
            </label>
            <label className="flex min-h-11 flex-col gap-1 text-sm">
              <span className="font-medium">{t('settings.quietEnd')}</span>
              <input
                type="time"
                className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
                value={minutesToInput(draft.quietHoursEndMinutes)}
                onChange={(e) => setDraft({ ...draft, quietHoursEndMinutes: inputToMinutes(e.target.value) })}
              />
            </label>
          </div>
          <TextLike
            label={t('settings.timezone')}
            value={draft.timezone}
            onChange={(timezone) => setDraft({ ...draft, timezone })}
          />
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.emailDigest}
              onChange={(e) => setDraft({ ...draft, emailDigest: e.target.checked })}
              className="size-5 accent-[var(--tessera-accent)]"
            />
            <span>
              <span className="font-medium">{t('settings.emailDigest')}</span>
              <span className="block text-text-secondary">{t('settings.emailDigestHint')}</span>
            </span>
          </label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-text-secondary">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">{t('settings.channelInApp')}</th>
                  <th className="py-2 font-medium">{t('settings.channelPush')}</th>
                  <th className="py-2 font-medium">{t('settings.channelEmail')}</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_KINDS.map((kind) => {
                  const row = draft.channels[kind];
                  const emailLocked = kind === 'security_alert';
                  return (
                    <tr key={kind} className="border-t border-border">
                      <td className="py-3 pr-3">
                        <span className="font-medium">{t(KIND_LABEL[kind])}</span>
                        {kind === 'board_invite' ? (
                          <span className="mt-1 block text-xs text-slate">{t('settings.kindBoardSoon')}</span>
                        ) : null}
                        {kind === 'scheduled_post_published' ? (
                          <span className="mt-1 block text-xs text-slate">{t('settings.kindScheduledSoon')}</span>
                        ) : null}
                        {emailLocked ? (
                          <span className="mt-1 block text-xs text-slate">{t('settings.securityEmailLocked')}</span>
                        ) : null}
                      </td>
                      {(['inApp', 'push', 'email'] as const).map((channel) => (
                        <td key={channel} className="py-3">
                          <input
                            type="checkbox"
                            className="size-5 accent-[var(--tessera-accent)]"
                            checked={emailLocked && channel === 'email' ? true : row[channel]}
                            disabled={emailLocked && channel === 'email'}
                            onChange={(e) => setChannel(kind, channel, e.target.checked)}
                            aria-label={`${t(KIND_LABEL[kind])} ${channel}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-medium">{t('settings.pushWeb')}</p>
            <p className="text-sm text-text-secondary">{t('settings.pushWebHint')}</p>
            <Button type="button" variant="secondary" onClick={() => void onPush()}>
              {t('settings.pushWebEnable')}
            </Button>
            {pushNote ? <p className="text-sm text-moss">{pushNote}</p> : null}
            <p className="text-xs text-slate">{webPushStatus()}</p>
          </div>
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

function TextLike({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-11 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

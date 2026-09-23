'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SensitivityLevel } from '@tessera/types';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextField, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function SafetySettingsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const wellbeing = useQuery({
    queryKey: ['wellbeing'],
    queryFn: () => api.getWellbeing(),
    enabled: Boolean(me.data),
  });
  const blocked = useQuery({
    queryKey: ['blocked'],
    queryFn: () => api.listBlocked(),
    enabled: Boolean(me.data),
  });
  const muted = useQuery({
    queryKey: ['muted'],
    queryFn: () => api.listMuted(),
    enabled: Boolean(me.data),
  });
  const restricted = useQuery({
    queryKey: ['restricted'],
    queryFn: () => api.listRestricted(),
    enabled: Boolean(me.data),
  });
  const exports = useQuery({
    queryKey: ['exports'],
    queryFn: () => api.listExports(),
    enabled: Boolean(me.data),
  });
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('warn');
  const [dailyReminder, setDailyReminder] = useState<number | null>(null);
  const [sessionNudge, setSessionNudge] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = me.data;
  const [seenProfile, setSeenProfile] = useState(profile);
  if (profile && profile !== seenProfile) {
    setSeenProfile(profile);
    setSensitivity(profile.sensitivityLevel);
  }
  const budget = wellbeing.data;
  const [seenBudget, setSeenBudget] = useState(budget);
  if (budget && budget !== seenBudget) {
    setSeenBudget(budget);
    setDailyReminder(budget.dailyReminderMinutes);
    setSessionNudge(budget.sessionNudgeMinutes);
  }

  const save = useMutation({
    mutationFn: async () => {
      await api.setSensitivity(sensitivity);
      await api.setWellbeing({
        dailyReminderMinutes: dailyReminder,
        sessionNudgeMinutes: sessionNudge,
      });
    },
    onSuccess: async () => {
      setMessage('Saved.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['wellbeing'] });
    },
    onError: (err) => setError(err instanceof TesseraApiError ? err.message : t('error.body')),
  });

  if (!me.data) {
    return (
      <p className="text-text-secondary">
        <Link className="underline" href="/login">
          {t('nav.signIn')}
        </Link>
      </p>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        {t('settings.safety')}
      </p>
      <Tile>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">{t('settings.sensitivity')}</span>
            <span className="text-text-secondary">{t('settings.sensitivityHint')}</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as SensitivityLevel)}
            >
              <option value="hide">{t('settings.sensitivityHide')}</option>
              <option value="warn">{t('settings.sensitivityWarn')}</option>
              <option value="show">{t('settings.sensitivityShow')}</option>
            </select>
          </label>
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">{t('settings.dailyReminder')}</span>
            <span className="text-text-secondary">{t('settings.dailyReminderHint')}</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={dailyReminder ?? ''}
              onChange={(e) => setDailyReminder(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('settings.wellbeingOff')}</option>
              {[30, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} {t('settings.loopsBudgetMinutes')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 flex-col gap-1 text-sm">
            <span className="font-medium">{t('settings.sessionNudge')}</span>
            <span className="text-text-secondary">{t('settings.sessionNudgeHint')}</span>
            <select
              className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
              value={sessionNudge ?? ''}
              onChange={(e) => setSessionNudge(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('settings.wellbeingOff')}</option>
              {[30, 45, 60, 90].map((minutes) => (
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
      <Tile>
        <p className="font-medium">{t('settings.blockedMutedRestricted')}</p>
        <p className="mt-2 text-sm text-text-secondary">{t('settings.restrictHint')}</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {(blocked.data?.items ?? []).map((row) => (
            <li key={row.id}>
              @{row.handle} · {t('profile.blocked')}
            </li>
          ))}
          {(muted.data?.items ?? []).map((row) => (
            <li key={row.id}>
              @{row.handle} · {t('profile.mute')}
            </li>
          ))}
          {(restricted.data?.items ?? []).map((row) => (
            <li key={row.id}>
              @{row.handle} · {t('settings.restricted')}
            </li>
          ))}
        </ul>
      </Tile>
      <Tile>
        <p className="font-medium">{t('settings.exportData')}</p>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.exportHint')}</p>
        <Button
          className="mt-3"
          type="button"
          variant="secondary"
          onClick={() =>
            void api
              .requestExport()
              .then(() => queryClient.invalidateQueries({ queryKey: ['exports'] }))
          }
        >
          {t('settings.exportStart')}
        </Button>
        <ul className="mt-3 text-sm text-text-secondary">
          {(exports.data?.items ?? []).map((job) => (
            <li key={job.id}>
              {job.status}
              {job.downloadUrl ? (
                <>
                  {' '}
                  ·{' '}
                  <a className="underline" href={job.downloadUrl}>
                    download
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </Tile>
      <Tile>
        <p className="font-medium">{t('settings.deleteAccount')}</p>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.deleteHint')}</p>
        {me.data.deletion.pending ? (
          <Button
            className="mt-3"
            type="button"
            onClick={() => void api.cancelDeletion().then(() => me.refetch())}
          >
            {t('settings.deleteCancel')}
          </Button>
        ) : (
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void api.requestDeletion(password).then(() => me.refetch());
            }}
          >
            <TextField
              name="password"
              label={t('settings.deleteConfirm')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              {t('settings.deleteSubmit')}
            </Button>
          </form>
        )}
      </Tile>
    </div>
  );
}

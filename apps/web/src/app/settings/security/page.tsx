'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextField, Tile } from '@tessera/ui';
import { api } from '../../../lib/api';

export default function SecurityPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    try {
      const result = await api.setupTotp();
      setSecret(result.secret);
      setOtpauth(result.otpauthUrl);
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.confirmTotp(String(form.get('code') ?? ''));
      setCodes(result.recoveryCodes);
      setSecret(null);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.disableTotp(String(form.get('password') ?? ''), String(form.get('code') ?? ''));
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">
        <Link href="/settings">{t('settings.title')}</Link> · {t('settings.security')}
      </p>
      <Tile>
        {me.data?.totpEnabled ? (
          <>
            <p className="mb-4 text-text-primary">{t('settings.totpOn')}</p>
            <form className="flex flex-col gap-4" onSubmit={disable}>
              <TextField name="password" label={t('auth.password')} type="password" required />
              <TextField name="code" label={t('auth.code')} required />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button variant="danger" type="submit">
                {t('settings.totpDisable')}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-4 text-text-primary">{t('settings.totpOff')}</p>
            {!secret ? (
              <Button type="button" onClick={start}>
                {t('settings.totpStart')}
              </Button>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={confirm}>
                <p className="break-all text-sm text-text-secondary">
                  {t('settings.totpSecret')}: {secret}
                </p>
                {otpauth ? (
                  <p className="break-all text-xs text-text-secondary">{otpauth}</p>
                ) : null}
                <TextField name="code" label={t('auth.code')} required />
                <Button type="submit">{t('settings.totpConfirm')}</Button>
              </form>
            )}
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          </>
        )}
        {codes ? (
          <div className="mt-6">
            <p className="mb-2 font-medium">{t('settings.recoveryCodes')}</p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Tile>
    </div>
  );
}

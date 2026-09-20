'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TesseraApiError } from '@tessera/api-client';
import { Button, TextField, Tile } from '@tessera/ui';
import { api, oauthUrl } from '../lib/api';

function errorMessage(err: unknown): string {
  if (err instanceof TesseraApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [challenge, setChallenge] = useState(params.get('challenge') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (challenge) {
        await api.verifyTwoFactor({
          challengeToken: challenge,
          code: code || undefined,
          recoveryCode: recovery || undefined,
          client: 'web',
        });
      } else {
        const result = await api.login({ email, password, client: 'web' });
        if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
          setChallenge(result.challengeToken);
          setPending(false);
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/me');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={challenge ? t('auth.twoFactorTitle') : t('auth.loginTitle')} body={challenge ? t('auth.twoFactorBody') : t('auth.loginBody')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {challenge ? (
          <>
            <TextField name="code" label={t('auth.code')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            <TextField name="recovery" label={t('auth.recoveryCode')} value={recovery} onChange={(e) => setRecovery(e.target.value)} />
          </>
        ) : (
          <>
            <TextField name="email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField name="password" label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {challenge ? t('common.continue') : t('auth.submitLogin')}
        </Button>
      </form>
      {!challenge ? <OauthButtons /> : null}
      <p className="mt-6 text-sm text-text-secondary">
        <Link className="underline" href="/forgot-password">
          {t('auth.forgot')}
        </Link>
        {' · '}
        {t('auth.noAccount')}{' '}
        <Link className="underline" href="/signup">
          {t('auth.submitSignup')}
        </Link>
      </p>
    </AuthCard>
  );
}

export function SignupForm() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.register({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        handle: String(form.get('handle') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        dateOfBirth: String(form.get('dateOfBirth') ?? ''),
        client: 'web',
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/me');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('auth.signupTitle')} body={t('auth.signupBody')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <TextField name="email" label={t('auth.email')} type="email" autoComplete="email" required />
        <TextField name="password" label={t('auth.password')} type="password" autoComplete="new-password" required hint="At least 10 characters, with letters and numbers." />
        <TextField name="handle" label={t('auth.handle')} autoComplete="username" required />
        <TextField name="displayName" label={t('auth.displayName')} autoComplete="name" required />
        <TextField name="dateOfBirth" label={t('auth.dateOfBirth')} type="date" required hint={t('auth.dateOfBirthHint')} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {t('auth.submitSignup')}
        </Button>
      </form>
      <OauthButtons />
      <p className="mt-6 text-sm text-text-secondary">
        {t('auth.hasAccount')}{' '}
        <Link className="underline" href="/login">
          {t('auth.submitLogin')}
        </Link>
      </p>
    </AuthCard>
  );
}

export function CompleteOauthForm() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const setupToken = params.get('setup') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.completeOauth({
        setupToken,
        handle: String(form.get('handle') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        dateOfBirth: String(form.get('dateOfBirth') ?? ''),
        client: 'web',
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/me');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('auth.completeTitle')} body={t('auth.completeBody')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <TextField name="handle" label={t('auth.handle')} required />
        <TextField name="displayName" label={t('auth.displayName')} required />
        <TextField name="dateOfBirth" label={t('auth.dateOfBirth')} type="date" required hint={t('auth.dateOfBirthHint')} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending || !setupToken}>
          {t('common.continue')}
        </Button>
      </form>
    </AuthCard>
  );
}

function OauthButtons() {
  const t = useTranslations();
  const configured = process.env.NEXT_PUBLIC_OAUTH_CONFIGURED === 'true';
  if (!configured) {
    return <p className="mt-4 text-sm text-text-secondary">{t('auth.oauthMissing')}</p>;
  }
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-center text-sm text-text-secondary">{t('common.or')}</p>
      <Button variant="secondary" asChild>
        <a href={oauthUrl('google')}>{t('auth.google')}</a>
      </Button>
      <Button variant="secondary" asChild>
        <a href={oauthUrl('apple')}>{t('auth.apple')}</a>
      </Button>
    </div>
  );
}

function AuthCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <Tile className="mx-auto w-full max-w-md">
      <h1 className="font-display text-3xl font-semibold text-text-primary">{title}</h1>
      <p className="mt-2 mb-6 text-text-secondary">{body}</p>
      {children}
    </Tile>
  );
}

export function ForgotForm() {
  const t = useTranslations();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.forgotPassword(String(form.get('email') ?? ''));
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthCard title={t('auth.forgotTitle')} body={t('auth.forgotBody')}>
      {sent ? (
        <p className="text-text-secondary">{t('auth.verifyBody')}</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <TextField name="email" label={t('auth.email')} type="email" required />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit">{t('auth.sendReset')}</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetForm() {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.resetPassword(token, String(form.get('password') ?? ''));
      router.push('/login');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthCard title={t('auth.resetTitle')} body="">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <TextField name="password" label={t('auth.password')} type="password" required />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit">{t('auth.resetSubmit')}</Button>
      </form>
    </AuthCard>
  );
}

export function VerifyForm() {
  const t = useTranslations();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    try {
      await api.verifyEmail(token);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setDone(true);
      router.push('/me');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthCard title={t('auth.verifyTitle')} body={t('auth.verifyBody')}>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="button" onClick={confirm} disabled={!token || done}>
        {t('auth.verifySubmit')}
      </Button>
    </AuthCard>
  );
}

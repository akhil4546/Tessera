'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { en } from '@tessera/i18n';
import { Button, TextField, Tile } from '@tessera/ui';
import { adminApi } from '../../lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@tessera.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminApi.login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate">{en.admin.signIn}</p>
      <Tile>
        <p className="mb-4 text-sm text-text-secondary">{en.admin.signInBody}</p>
        <form className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
          <TextField name="email" label={en.auth.email} value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            name="password"
            label={en.auth.password}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit">{en.auth.submitLogin}</Button>
        </form>
      </Tile>
    </div>
  );
}

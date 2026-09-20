'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { en } from '@tessera/i18n';
import { adminApi } from '../lib/api';

export function AdminNav() {
  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminApi.me() as Promise<{ email: string; role: string; displayName: string }>,
    retry: false,
  });
  if (!me.data) {
    return (
      <Link className="text-sm underline" href="/login">
        {en.admin.signIn}
      </Link>
    );
  }
  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm">
      <Link className="underline" href="/">
        {en.admin.queue}
      </Link>
      <Link className="underline" href="/users">
        {en.admin.users}
      </Link>
      <Link className="underline" href="/appeals">
        {en.admin.appeals}
      </Link>
      <Link className="underline" href="/audit">
        {en.admin.audit}
      </Link>
      <Link className="underline" href="/keywords">
        {en.admin.keywords}
      </Link>
      <span className="text-text-secondary">
        {me.data.displayName} · {me.data.role}
      </span>
      <button
        type="button"
        className="underline"
        onClick={() => void adminApi.logout().then(() => (window.location.href = '/login'))}
      >
        {en.nav.signOut}
      </button>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NAV_ITEMS, type NavItemId } from '@tessera/types';
import { AppShell, Button, ThemeToggle, Wordmark } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';

const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'];

function isAuthPath(pathname: string): boolean {
  return AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function activeId(pathname: string): NavItemId {
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.id;
  if (pathname.startsWith('/settings') || pathname.startsWith('/u/')) return 'me';
  if (pathname.startsWith('/p/') || pathname.startsWith('/loops')) return 'home';
  const prefix = NAV_ITEMS.filter((item) => item.href !== '/').find((item) =>
    pathname.startsWith(item.href),
  );
  return prefix?.id ?? 'home';
}

export function WebShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch (err) {
        if (err instanceof TesseraApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
  const onAuthScreen = isAuthPath(pathname);
  const badge = useQuery({
    queryKey: ['inbox', 'badge'],
    queryFn: () => api.inboxBadge(),
    enabled: Boolean(me.data) && !onAuthScreen,
    refetchInterval: onAuthScreen ? false : 30_000,
  });

  if (onAuthScreen) {
    return (
      <div className="min-h-dvh bg-surface text-text-primary">
        <header className="flex items-center justify-between px-4 py-4 md:px-8">
          <Link href="/">
            <Wordmark />
          </Link>
          <ThemeToggle
            groupLabel={t('theme.toggle')}
            labels={{ light: t('theme.light'), dark: t('theme.dark'), system: t('theme.system') }}
          />
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    );
  }

  const unread =
    (badge.data?.unreadMessages ?? 0) +
    (badge.data?.pendingRequests ?? 0) +
    (badge.data?.unreadActivity ?? 0);

  const items = NAV_ITEMS.map((item) => ({
    id: item.id,
    href: item.href,
    label: t(item.labelKey),
    badge: item.id === 'inbox' && unread > 0 ? unread : undefined,
  }));

  return (
    <AppShell
      items={items}
      activeId={activeId(pathname)}
      ariaLabel={t('nav.aria')}
      wordmark={
        <Link href="/">
          <Wordmark />
        </Link>
      }
      toolbar={
        <div className="flex items-center gap-2">
          {me.data ? (
            <>
              <Button variant="ghost" asChild>
                <Link href="/settings">{t('nav.settings')}</Link>
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await api.logout();
                  await me.refetch();
                  router.push('/login');
                }}
              >
                {t('nav.signOut')}
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href="/login">{t('nav.signIn')}</Link>
            </Button>
          )}
          <ThemeToggle
            groupLabel={t('theme.toggle')}
            labels={{
              light: t('theme.light'),
              dark: t('theme.dark'),
              system: t('theme.system'),
            }}
          />
        </div>
      }
      linkComponent={Link}
    >
      {children}
    </AppShell>
  );
}

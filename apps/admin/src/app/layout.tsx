import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { ThemeProvider, ThemeToggle, Wordmark } from '@tessera/ui';
import { en } from '@tessera/i18n';
import Link from 'next/link';
import './globals.css';
import { Providers } from '../components/providers';
import { AdminNav } from '../components/admin-nav';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-tessera-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-tessera-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tessera Admin',
  description: 'Moderation and operations. Separate staff session from the public app.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <ThemeProvider>
          <Providers>
            <div className="min-h-dvh bg-surface text-text-primary">
              <header className="flex items-center justify-between border-b border-border bg-surface-elevated px-6 py-4">
                <Link href="/">
                  <Wordmark subtitle="Admin" />
                </Link>
                <div className="flex items-center gap-4">
                  <AdminNav />
                  <ThemeToggle
                    groupLabel={en.theme.toggle}
                    labels={{
                      light: en.theme.light,
                      dark: en.theme.dark,
                      system: en.theme.system,
                    }}
                  />
                </div>
              </header>
              <main className="px-6 py-10">{children}</main>
            </div>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

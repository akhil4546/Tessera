import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Providers } from '../components/providers';
import { WebShell } from '../components/web-shell';
import './globals.css';

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
  title: 'Tessera',
  description: 'A photo and video social platform. Chronological by default.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tessera-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <WebShell>{children}</WebShell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

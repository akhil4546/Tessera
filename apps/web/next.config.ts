import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: [
    '@tessera/ui',
    '@tessera/tokens',
    '@tessera/i18n',
    '@tessera/types',
    '@tessera/validation',
    '@tessera/api-client',
    '@tessera/media',
  ],
};

export default withNextIntl(nextConfig);

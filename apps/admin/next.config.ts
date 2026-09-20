import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@tessera/ui', '@tessera/tokens', '@tessera/i18n', '@tessera/types'],
};

export default nextConfig;

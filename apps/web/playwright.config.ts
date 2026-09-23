import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = 'http://127.0.0.1:3001';

const apiEnv = {
  PORT: '3001',
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://tessera:tessera@localhost:5432/tessera',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-jwt-access-secret-32-chars-min',
  JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET ?? 'test-jwt-admin-secret-32-characters-long',
  JWT_PURPOSE_SECRET:
    process.env.JWT_PURPOSE_SECRET ?? 'test-jwt-purpose-secret-32-characters-long',
  TOTP_ENCRYPTION_KEY:
    process.env.TOTP_ENCRYPTION_KEY ??
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  WEB_ORIGIN: baseURL,
  COOKIE_SECURE: 'false',
  CORS_ORIGINS: `${baseURL},http://localhost:${port}`,
  LOG_LEVEL: 'silent',
  STORAGE_DRIVER: 'fs',
  MEDIA_PROCESS: 'inline',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @tessera/api start',
      url: `${apiURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: `pnpm exec next dev --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: apiURL,
      },
    },
  ],
});

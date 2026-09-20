const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
];

export function allowedOrigins(): string[] {
  const extra = process.env.CORS_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  const web = process.env.WEB_ORIGIN;
  const admin = process.env.ADMIN_ORIGIN;
  return [...new Set([...DEFAULT_ORIGINS, ...extra, web, admin].filter((value): value is string => Boolean(value)))];
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

export function apiPublicUrl(): string {
  return process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
}

export function webPublicUrl(): string {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
}

export const CSRF_EXEMPT_PATHS = new Set([
  '/v1/auth/google/callback',
  '/v1/auth/apple/callback',
]);

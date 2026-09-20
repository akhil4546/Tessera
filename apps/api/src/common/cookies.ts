import type { CookieOptions, Request, Response } from 'express';

export const ACCESS_COOKIE = 'tessera_at';
export const REFRESH_COOKIE = 'tessera_rt';
export const ADMIN_ACCESS_COOKIE = 'tessera_admin_at';
export const ADMIN_REFRESH_COOKIE = 'tessera_admin_rt';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

function secureCookies(): boolean {
  return process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
}

export function cookieBase(): CookieOptions {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const base = cookieBase();
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const base = cookieBase();
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

export function readRefreshToken(req: Request, bodyToken?: string): string | undefined {
  return bodyToken || (req.cookies?.[REFRESH_COOKIE] as string | undefined);
}

export function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return req.cookies?.[ACCESS_COOKIE] as string | undefined;
}

export function setAdminCookies(res: Response, accessToken: string, refreshToken: string): void {
  const base = cookieBase();
  res.cookie(ADMIN_ACCESS_COOKIE, accessToken, { ...base, maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAdminCookies(res: Response): void {
  const base = cookieBase();
  res.clearCookie(ADMIN_ACCESS_COOKIE, base);
  res.clearCookie(ADMIN_REFRESH_COOKIE, base);
}

export function readAdminRefreshToken(req: Request, bodyToken?: string): string | undefined {
  return bodyToken || (req.cookies?.[ADMIN_REFRESH_COOKIE] as string | undefined);
}

export function readAdminAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return req.cookies?.[ADMIN_ACCESS_COOKIE] as string | undefined;
}

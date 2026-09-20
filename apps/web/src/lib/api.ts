'use client';

import { createClient } from '@tessera/api-client';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = createClient({
  baseUrl: API_BASE,
  credentials: 'include',
});

export function oauthUrl(provider: 'google' | 'apple'): string {
  return `${API_BASE}/v1/auth/${provider}?client=web`;
}

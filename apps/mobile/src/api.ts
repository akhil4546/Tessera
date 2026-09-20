import { createClient } from '@tessera/api-client';
import { getAccessToken } from './session';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = createClient({
  baseUrl: API_BASE,
  getAccessToken,
});

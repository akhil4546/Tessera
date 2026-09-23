import { createClient } from '@tessera/api-client';
import { getAccessToken } from './session';

const configured = process.env.EXPO_PUBLIC_API_URL as unknown;
export const API_BASE =
  typeof configured === 'string' && configured.length > 0 ? configured : 'http://localhost:3001';

export const api = createClient({
  baseUrl: API_BASE,
  getAccessToken,
});

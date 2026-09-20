import { Platform } from 'react-native';

const ACCESS = 'tessera.access';
const REFRESH = 'tessera.refresh';

type MemoryStore = Record<string, string>;
const memory: MemoryStore = {};

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return memory[key] ?? null;
    }
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    } catch {
      if (value === null) delete memory[key];
      else memory[key] = value;
      return;
    }
  }
  const SecureStore = await import('expo-secure-store');
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export async function getAccessToken(): Promise<string | null> {
  return read(ACCESS);
}

export async function getRefreshToken(): Promise<string | null> {
  return read(REFRESH);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  await write(ACCESS, access);
  await write(REFRESH, refresh);
}

export async function clearTokens(): Promise<void> {
  await write(ACCESS, null);
  await write(REFRESH, null);
}

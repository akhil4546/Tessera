import * as SecureStore from 'expo-secure-store';
import { api } from './api';

const KEY = 'tessera-outbox';

export type OutboxItem = {
  conversationId: string;
  clientId: string;
  kind: 'text';
  body: string;
  createdAt: string;
};

/**
 * Offline send queue for mobile. Labelled: retries when the API is reachable again.
 * Not a fake send — items stay queued until POST /v1/inbox/.../messages succeeds.
 */
export async function enqueue(item: OutboxItem): Promise<void> {
  const items = await load();
  items.push(item);
  await SecureStore.setItemAsync(KEY, JSON.stringify(items));
}

export async function load(): Promise<OutboxItem[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function flush(): Promise<number> {
  const items = await load();
  if (items.length === 0) return 0;
  const remaining: OutboxItem[] = [];
  let sent = 0;
  for (const item of items) {
    try {
      await api.sendMessage(item.conversationId, {
        kind: item.kind,
        body: item.body,
        clientId: item.clientId,
      });
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }
  await SecureStore.setItemAsync(KEY, JSON.stringify(remaining));
  return sent;
}

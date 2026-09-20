export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
};

export type ExpoPushTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

export async function sendExpoPush(
  messages: ExpoPushMessage[],
  accessToken?: string,
): Promise<{ invalidTokens: string[] }> {
  if (messages.length === 0) return { invalidTokens: [] };
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    throw new Error(`Expo push HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: ExpoPushTicket[] };
  const invalidTokens: string[] = [];
  for (const [index, ticket] of (body.data ?? []).entries()) {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = messages[index]?.to;
      if (token) invalidTokens.push(token);
    }
  }
  return { invalidTokens };
}

export function expoConfigured(): boolean {
  return process.env.PUSH_DRIVER === 'live' || Boolean(process.env.EXPO_ACCESS_TOKEN);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

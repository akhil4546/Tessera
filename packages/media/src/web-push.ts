import { vapidConfigured } from './push.ts';

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
};

let loaded: WebPushModule | null | undefined;

async function webPush(): Promise<WebPushModule | null> {
  if (loaded !== undefined) return loaded;
  if (!vapidConfigured()) {
    loaded = null;
    return null;
  }
  try {
    const mod = (await import('web-push')) as unknown as { default?: WebPushModule } & WebPushModule;
    const api = mod.default ?? mod;
    api.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:noreply@localhost',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    loaded = api;
    return api;
  } catch {
    loaded = null;
    return null;
  }
}

export async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
): Promise<{ invalid: boolean }> {
  const api = await webPush();
  if (!api) return { invalid: false };
  try {
    await api.sendNotification(subscription, payload);
    return { invalid: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return { invalid: status === 404 || status === 410 };
  }
}

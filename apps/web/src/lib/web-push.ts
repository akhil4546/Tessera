import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function webPushStatus(): string {
  if (typeof window === 'undefined') return '';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'This browser cannot take Web Push.';
  }
  return '';
}

export async function enableWebPush(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser cannot take Web Push.');
  }
  const vapid = await api.vapidPublicKey();
  const registration = await navigator.serviceWorker.register('/sw.js');
  await registration.update();
  if (!vapid.publicKey) {
    return 'SOFT-FAIL: VAPID keys are not configured. Tessera will store a token later; push is not sent.';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Web Push subscription was incomplete.');
  }
  await api.registerDevice({
    platform: 'web_push',
    token: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  });
  return 'Browser push is on this device.';
}

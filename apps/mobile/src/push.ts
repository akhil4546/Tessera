import { api } from './api';

/**
 * Registers an Expo push token when expo-notifications is available.
 * SOFT-FAIL: Expo Go without push credentials, or a missing native module, is labelled — not stubbed as success.
 */
export async function registerExpoPush(): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    const Constants = await import('expo-constants');
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'Push permission was not granted.';
    const projectId =
      Constants.default.easConfig?.projectId ??
      (Constants.default.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerDevice({
      platform: 'expo',
      token: token.data,
    });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.warn(`SOFT-FAIL: Expo push token not registered (${message}).`);
    return `SOFT-FAIL: Expo push not registered (${message}).`;
  }
}

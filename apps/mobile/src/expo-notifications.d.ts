declare module 'expo-notifications' {
  export function requestPermissionsAsync(): Promise<{ granted: boolean }>;
  export function getExpoPushTokenAsync(options?: {
    projectId?: string;
  }): Promise<{ data: string }>;
}

declare module 'expo-constants' {
  const constants: {
    easConfig?: { projectId?: string };
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
  };
  export default constants;
}

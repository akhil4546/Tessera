import { en } from '@tessera/i18n';

export function t(path: string): string {
  const value = path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, en);
  return typeof value === 'string' ? value : path;
}

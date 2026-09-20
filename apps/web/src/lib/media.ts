import { API_BASE } from './api';

export function mediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
}

export function cssFilter(filterCss: string, adjustmentsCss: string): string {
  return [filterCss, adjustmentsCss].filter(Boolean).join(' ');
}

'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function errorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined;
  const error = body.error;
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined;
  return typeof error.message === 'string' ? error.message : undefined;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 204) return null;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message = errorMessage(json) ?? 'Request failed';
    throw new Error(message);
  }
  return json;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request('/v1/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/v1/admin/auth/logout', { method: 'POST' }),
  me: () => request('/v1/admin/me'),
  queue: (status?: string) => request(`/v1/admin/queue${status ? `?status=${status}` : ''}`),
  getCase: (id: string) => request(`/v1/admin/cases/${id}`),
  claim: (id: string) => request(`/v1/admin/cases/${id}/claim`, { method: 'POST' }),
  act: (id: string, kind: string, note: string) =>
    request(`/v1/admin/cases/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ kind, note }),
    }),
  users: (q: string) => request(`/v1/admin/users?q=${encodeURIComponent(q)}`),
  getUser: (id: string) => request(`/v1/admin/users/${id}`),
  suspend: (id: string, reason: string, days: number | null) =>
    request(`/v1/admin/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason, days }),
    }),
  unsuspend: (id: string) => request(`/v1/admin/users/${id}/unsuspend`, { method: 'POST' }),
  appeals: () => request('/v1/admin/appeals'),
  resolveAppeal: (id: string, status: 'upheld' | 'rejected', decision: string) =>
    request(`/v1/admin/appeals/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, decision }),
    }),
  audit: () => request('/v1/admin/audit'),
  keywords: () => request('/v1/admin/keyword-filters'),
  addKeyword: (keyword: string, action: string) =>
    request('/v1/admin/keyword-filters', {
      method: 'POST',
      body: JSON.stringify({ keyword, action }),
    }),
  removeKeyword: (id: string) => request(`/v1/admin/keyword-filters/${id}`, { method: 'DELETE' }),
};

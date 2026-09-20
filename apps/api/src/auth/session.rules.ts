export type RefreshDecision = 'ok' | 'expired' | 'revoked' | 'reuse';

export function inspectRefreshSession(
  session: {
    revokedAt: Date | null;
    replacedById: string | null;
    expiresAt: Date;
  },
  now = new Date(),
): RefreshDecision {
  if (session.revokedAt) return 'revoked';
  if (session.expiresAt <= now) return 'expired';
  if (session.replacedById) return 'reuse';
  return 'ok';
}

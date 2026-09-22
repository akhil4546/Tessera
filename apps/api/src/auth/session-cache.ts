import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import { Redis } from 'ioredis';
import { ACCESS_TTL_SECONDS } from '../common/cookies.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Positive cache lifetime. Also the spec ceiling: never longer than 60 seconds. */
export const SESSION_CACHE_MAX_SECONDS = 60;

const REDIS_BACKOFF_MS = 5_000;
const REDIS_BACKOFF_MAX_MS = 30_000;
/**
 * After a Redis failure, ignore cached tuples until a positive entry written
 * just before the failure has expired. A logout that could not reach Redis
 * must not be served from that entry when Redis comes back.
 */
const DISTRUST_MS = (SESSION_CACHE_MAX_SECONDS + 1) * 1000;
/** Denial marker. Not a privilege grant, so it may live for the whole access token. */
const REVOCATION_TTL_SECONDS = ACCESS_TTL_SECONDS;
const TOMBSTONE = '0';

const READ_LUA = `
-- session-cache-read
local row = redis.call('GET', KEYS[1])
local gen = redis.call('GET', KEYS[2])
if not gen then
  gen = '0'
end
return {row, gen}
`.trim();

/**
 * Refuse to write over a tombstone or a generation observed before a bulk revoke.
 * Both checks happen in this script so a slow Postgres read cannot resurrect a session.
 */
const FILL_LUA = `
-- session-cache-fill
if redis.call('GET', KEYS[1]) == '0' then
  return 0
end
local gen = redis.call('GET', KEYS[2])
if not gen then
  gen = '0'
end
if gen ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`.trim();

const TOMBSTONE_LUA = `
-- session-cache-tombstone
local ttl = tonumber(ARGV[1])
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], '0', 'EX', ttl)
end
return #KEYS
`.trim();

const GENERATION_LUA = `
-- session-cache-generation
local gen = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
return gen
`.trim();

export type SessionAccount = {
  userId: string;
  expiresAt: Date;
  suspendedAt: Date | null;
  suspensionEndsAt: Date | null;
  deactivatedAt: Date | null;
};

type Circuit = 'closed' | 'open';
type ReadResult =
  | { kind: 'off' }
  | { kind: 'revoked' }
  | { kind: 'hit'; account: SessionAccount }
  | { kind: 'miss'; gen: number };
type StoreResult = 'stored' | 'rejected' | 'unavailable';

export function sessionCacheKey(sessionId: string): string {
  return `auth:sid:${sessionId}`;
}

export function sessionGenerationKey(userId: string): string {
  return `auth:ugen:${userId}`;
}

/** Shortest of 60s, the access-token lifetime, and the time left on the session. */
export function sessionCacheTtlSeconds(expiresAt: Date, now = Date.now()): number {
  const untilSession = Math.floor((expiresAt.getTime() - now) / 1000);
  if (untilSession <= 0) return 0;
  return Math.min(SESSION_CACHE_MAX_SECONDS, ACCESS_TTL_SECONDS, untilSession);
}

export function isAccountSuspended(
  account: { suspendedAt: Date | null; suspensionEndsAt: Date | null },
  now = new Date(),
): boolean {
  if (!account.suspendedAt) return false;
  if (!account.suspensionEndsAt) return true;
  return account.suspensionEndsAt.getTime() > now.getTime();
}

function parseNullableDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function encode(account: SessionAccount, gen: number): string {
  return JSON.stringify({
    v: 1,
    gen,
    userId: account.userId,
    expiresAt: account.expiresAt.toISOString(),
    suspendedAt: account.suspendedAt?.toISOString() ?? null,
    suspensionEndsAt: account.suspensionEndsAt?.toISOString() ?? null,
    deactivatedAt: account.deactivatedAt?.toISOString() ?? null,
  });
}

function decode(row: string, gen: number, userId: string): SessionAccount | 'miss' | 'expired' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row);
  } catch {
    return 'miss';
  }
  if (!parsed || typeof parsed !== 'object') return 'miss';
  const body = parsed as Record<string, unknown>;
  if (body.v !== 1 || typeof body.userId !== 'string' || typeof body.gen !== 'number')
    return 'miss';
  if (body.gen !== gen || body.userId !== userId) return 'miss';
  const expiresAt = parseNullableDate(body.expiresAt);
  const suspendedAt = parseNullableDate(body.suspendedAt);
  const suspensionEndsAt = parseNullableDate(body.suspensionEndsAt);
  const deactivatedAt = parseNullableDate(body.deactivatedAt);
  if (
    !expiresAt ||
    suspendedAt === undefined ||
    suspensionEndsAt === undefined ||
    deactivatedAt === undefined
  ) {
    return 'miss';
  }
  if (expiresAt.getTime() <= Date.now()) return 'expired';
  return { userId, expiresAt, suspendedAt, suspensionEndsAt, deactivatedAt };
}

function parseRead(result: unknown): { row: string | null; gen: number } {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('session cache read returned an unexpected value');
  }
  const row = result[0];
  const gen = Number(result[1]);
  if (row !== null && row !== false && typeof row !== 'string') {
    throw new Error('session cache read returned a non-string row');
  }
  if (!Number.isInteger(gen) || gen < 0) {
    throw new Error('session cache read returned a bad generation');
  }
  return { row: typeof row === 'string' ? row : null, gen };
}

@Injectable()
export class SessionCache implements OnModuleDestroy {
  private readonly log = new Logger(SessionCache.name);
  private redis: Redis | null = null;
  private circuit: Circuit = 'closed';
  private redisDownUntil = 0;
  private backoffMs = REDIS_BACKOFF_MS;
  private distrustUntil = 0;
  /** One successful command during a distrust window is enough to mark Redis reachable. */
  private probedDuringDistrust = false;
  private warnedUnconfigured = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Session row plus the suspension fields the auth guard checks.
   * Null when the session is missing, revoked, expired, or was revoked while loading.
   */
  async resolve(sessionId: string, userId: string): Promise<SessionAccount | null> {
    const first = await this.read(sessionId, userId);
    if (first.kind === 'revoked') return null;
    if (first.kind === 'hit') return first.account;

    const loaded = await this.load(sessionId, userId);
    if (!loaded) return null;
    if (first.kind === 'off') return loaded;

    const decision = await this.remember(sessionId, userId, first.gen, loaded);
    if (decision !== 'rejected') return loaded;

    const second = await this.read(sessionId, userId);
    if (second.kind === 'revoked') return null;
    if (second.kind === 'hit') return second.account;

    const reloaded = await this.load(sessionId, userId);
    if (!reloaded) return null;
    if (second.kind === 'off') return reloaded;

    const rewritten = await this.remember(sessionId, userId, second.gen, reloaded);
    if (rewritten === 'rejected') {
      const third = await this.read(sessionId, userId);
      if (third.kind === 'revoked' || third.kind === 'off') return null;
      if (third.kind === 'hit') return third.account;
    }
    return reloaded;
  }

  /** Drop these session keys. A later fill in the same access-token lifetime will not overwrite them. */
  async invalidateSessions(sessionIds: readonly string[]): Promise<void> {
    const unique = [...new Set(sessionIds.filter((id) => id.length > 0))];
    if (unique.length === 0) return;
    const outcome = await this.command((redis) =>
      redis.eval(
        TOMBSTONE_LUA,
        unique.length,
        ...unique.map(sessionCacheKey),
        String(REVOCATION_TTL_SECONDS),
      ),
    );
    void outcome;
  }

  /** Mark every cached tuple for this user stale. Call only after the revoke has committed. */
  async invalidateUser(userId: string): Promise<void> {
    if (!userId) return;
    const outcome = await this.command((redis) =>
      redis.eval(GENERATION_LUA, 1, sessionGenerationKey(userId), String(REVOCATION_TTL_SECONDS)),
    );
    void outcome;
  }

  /**
   * Revoke matching live sessions, then drop their cache entries.
   * `session` leaves every other device cached. `user` also bumps the user's
   * generation so a session created during the revoke cannot keep a tuple
   * written just before it. The bump happens after the update commits: an
   * earlier bump would let a reload cache the still-valid row under the new generation.
   */
  async revokeWhere(
    where: Prisma.SessionWhereInput,
    scope: 'session' | 'user',
    userId?: string,
  ): Promise<number> {
    const rows = await this.prisma.session.findMany({
      where: { AND: [where, { revokedAt: null }] },
      select: { id: true, userId: true },
    });
    const result = await this.prisma.session.updateMany({
      where: { AND: [where, { revokedAt: null }] },
      data: { revokedAt: new Date() },
    });
    const ids = new Set(rows.map((row) => row.id));
    if (typeof where.id === 'string') ids.add(where.id);
    await this.invalidateSessions([...ids]);
    if (scope === 'user') {
      const userIds = new Set(rows.map((row) => row.userId));
      if (userId) userIds.add(userId);
      if (typeof where.userId === 'string') userIds.add(where.userId);
      for (const id of userIds) await this.invalidateUser(id);
    }
    return result.count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }

  private async load(sessionId: string, userId: string): Promise<SessionAccount | null> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        expiresAt: true,
        user: { select: { suspendedAt: true, suspensionEndsAt: true, deactivatedAt: true } },
      },
    });
    if (!session?.user) return null;
    return {
      userId,
      expiresAt: session.expiresAt,
      suspendedAt: session.user.suspendedAt,
      suspensionEndsAt: session.user.suspensionEndsAt,
      deactivatedAt: session.user.deactivatedAt,
    };
  }

  private async read(sessionId: string, userId: string): Promise<ReadResult> {
    const distrust = Date.now() < this.distrustUntil;
    if (distrust && this.probedDuringDistrust) return { kind: 'off' };
    const outcome = await this.command((redis) =>
      redis.eval(READ_LUA, 2, sessionCacheKey(sessionId), sessionGenerationKey(userId)),
    );
    if (!outcome.ok) return { kind: 'off' };
    if (distrust) {
      this.probedDuringDistrust = true;
      return { kind: 'off' };
    }
    let parsed: { row: string | null; gen: number };
    try {
      parsed = parseRead(outcome.value);
    } catch (err) {
      this.failRedis(err instanceof Error ? err.message : 'bad cache payload');
      return { kind: 'off' };
    }
    if (parsed.row === null) return { kind: 'miss', gen: parsed.gen };
    if (parsed.row === TOMBSTONE) return { kind: 'revoked' };
    const account = decode(parsed.row, parsed.gen, userId);
    if (account === 'expired') return { kind: 'revoked' };
    if (account === 'miss') return { kind: 'miss', gen: parsed.gen };
    return { kind: 'hit', account };
  }

  private async remember(
    sessionId: string,
    userId: string,
    gen: number,
    account: SessionAccount,
  ): Promise<StoreResult> {
    const ttl = sessionCacheTtlSeconds(account.expiresAt);
    if (ttl <= 0) return 'unavailable';
    const outcome = await this.command((redis) =>
      redis.eval(
        FILL_LUA,
        2,
        sessionCacheKey(sessionId),
        sessionGenerationKey(userId),
        String(gen),
        encode(account, gen),
        String(ttl),
      ),
    );
    if (!outcome.ok) return 'unavailable';
    return Number(outcome.value) === 1 ? 'stored' : 'rejected';
  }

  /**
   * Background Redis errors must not move the deadline. If they did, a reconnect
   * loop would keep the circuit open and the next request would never probe.
   */
  private onRedisError(reason: string): void {
    if (this.circuit === 'open') return;
    this.failRedis(reason);
  }

  private failRedis(reason: string): void {
    const now = Date.now();
    if (this.circuit === 'open' && now < this.redisDownUntil) return;
    if (this.circuit !== 'open') {
      this.distrustUntil = Math.max(this.distrustUntil, now + DISTRUST_MS);
      this.probedDuringDistrust = false;
    }
    const wait = this.backoffMs;
    this.circuit = 'open';
    this.redisDownUntil = now + wait;
    this.backoffMs = Math.min(wait * 2, REDIS_BACKOFF_MAX_MS);
    this.log.error(
      `DEGRADED: Redis session cache failed (${reason}). Auth is falling back to Postgres. Retrying Redis in ${wait}ms.`,
    );
  }

  private recoverRedis(): void {
    if (this.circuit === 'closed' && this.backoffMs === REDIS_BACKOFF_MS) return;
    const wasOpen = this.circuit === 'open';
    this.circuit = 'closed';
    this.redisDownUntil = 0;
    this.backoffMs = REDIS_BACKOFF_MS;
    if (wasOpen) this.log.warn('Redis session cache is reachable again.');
  }

  private warnUnconfigured(): void {
    if (this.warnedUnconfigured) return;
    this.warnedUnconfigured = true;
    this.log.warn(
      'DEGRADED: REDIS_URL is unset. Auth checks the session in Postgres on every request. This is for local dev.',
    );
  }

  private redisClient(): Redis | null {
    if (this.circuit === 'open' && Date.now() < this.redisDownUntil) return null;
    const url = process.env.REDIS_URL;
    if (!url) {
      this.warnUnconfigured();
      return null;
    }
    if (!this.redis) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 1_000,
        commandTimeout: 1_000,
      });
      this.redis.on('error', (err: Error) => {
        this.onRedisError(err instanceof Error ? err.message : String(err));
      });
    }
    return this.redis;
  }

  private async command<T>(
    run: (redis: Redis) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    const redis = this.redisClient();
    if (!redis) return { ok: false };
    try {
      if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
      const value = await run(redis);
      this.recoverRedis();
      return { ok: true, value };
    } catch (err) {
      this.failRedis(err instanceof Error ? err.message : 'unknown error');
      return { ok: false };
    }
  }
}

import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import {
  IDEMPOTENCY_PENDING_STATUS,
  IDEMPOTENCY_PENDING_TTL_MS,
  IDEMPOTENCY_TTL_MS,
} from '@tessera/media';
import { TesseraHttpError } from './http-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const IDEMPOTENCY_KEY_MAX = 255;
const RECORD_VERSION = 1;

export type IdempotencyEnvelope = { v: 1; hash: string; response: unknown };

export type IdempotencyDecision =
  | { kind: 'replay'; body: unknown }
  | { kind: 'mismatch' }
  | { kind: 'pending' }
  | { kind: 'expired' }
  | { kind: 'legacy' };

type StoredRecord = { id: string; status: number; body: unknown; createdAt: Date };

export type IdempotencyBegin = { kind: 'replay'; body: unknown } | { kind: 'proceed' };

/**
 * Idempotency-Key is optional. Empty means the client did not ask for replay.
 * 'invalid' means the header was present but unusable.
 */
export function readIdempotencyKey(header: string | string[] | undefined): string | null {
  if (header === undefined) return null;
  if (Array.isArray(header)) return 'invalid';
  const key = header.trim();
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX) return 'invalid';
  // The class is the ASCII controls themselves, which this key must reject.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) return 'invalid';
  return key;
}

export function idempotencyRoute(
  method: string,
  path: string,
  query?: Record<string, unknown>,
): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query ?? {}).sort()) {
    const value = query?.[key];
    if (value === undefined) continue;
    const rawItems = Array.isArray(value) ? value : [value];
    const items = rawItems.flatMap((item) => {
      const text = queryItem(item);
      return text === null ? [] : [text];
    });
    items.sort();
    for (const item of items) params.append(key, item);
  }
  const qs = params.toString();
  const clean = path.split('?')[0] || '/';
  return qs ? `${method.toUpperCase()} ${clean}?${qs}` : `${method.toUpperCase()} ${clean}`;
}

function queryItem(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

export function hashIdempotencyBody(body: unknown): string {
  const hash = createHash('sha256');
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    hash.update('bin:');
    hash.update(body);
    return hash.digest('hex');
  }
  hash.update('json:');
  hash.update(stableStringify(body ?? null));
  return hash.digest('hex');
}

export function readEnvelope(body: unknown): IdempotencyEnvelope | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.v !== RECORD_VERSION || typeof record.hash !== 'string' || !('response' in record))
    return null;
  return { v: 1, hash: record.hash, response: record.response };
}

export function classifyRecord(
  record: Pick<StoredRecord, 'status' | 'body' | 'createdAt'>,
  hash: string,
  now: Date,
): IdempotencyDecision {
  const age = now.getTime() - record.createdAt.getTime();
  if (record.status === IDEMPOTENCY_PENDING_STATUS) {
    if (age >= IDEMPOTENCY_PENDING_TTL_MS) return { kind: 'expired' };
    const envelope = readEnvelope(record.body);
    if (envelope && envelope.hash !== hash) return { kind: 'mismatch' };
    return { kind: 'pending' };
  }
  if (age >= IDEMPOTENCY_TTL_MS) return { kind: 'expired' };
  const envelope = readEnvelope(record.body);
  if (!envelope) return { kind: 'legacy' };
  if (envelope.hash !== hash) return { kind: 'mismatch' };
  return { kind: 'replay', body: envelope.response };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array)
  ) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) sorted[key] = sortValue(item);
    }
    return sorted;
  }
  return value;
}

function envelope(hash: string, response: unknown): Prisma.InputJsonValue {
  return {
    v: RECORD_VERSION,
    hash,
    response: JSON.parse(JSON.stringify(response ?? null)) as Prisma.InputJsonValue,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class IdempotencyService {
  private readonly log = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async begin(userId: string, key: string, route: string, hash: string): Promise<IdempotencyBegin> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key_route: { userId, key, route } },
    });
    if (existing) {
      const decision = classifyRecord(existing, hash, new Date());
      if (decision.kind === 'expired') {
        await this.prisma.idempotencyRecord.deleteMany({
          where: { id: existing.id, status: existing.status },
        });
      } else {
        return this.decide(decision);
      }
    }

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          route,
          status: IDEMPOTENCY_PENDING_STATUS,
          body: envelope(hash, null),
        },
      });
      return { kind: 'proceed' };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_key_route: { userId, key, route } },
      });
      if (!winner) throw error;
      return this.decide(classifyRecord(winner, hash, new Date()));
    }
  }

  async complete(
    userId: string,
    key: string,
    route: string,
    status: number,
    body: unknown,
    hash: string,
  ): Promise<void> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key_route: { userId, key, route } },
    });
    const stored = row ? readEnvelope(row.body) : null;
    if (!row || row.status !== IDEMPOTENCY_PENDING_STATUS || stored?.hash !== hash) {
      this.log.warn('SOFT-FAIL: idempotency lock was no longer ours when storing the response.');
      return;
    }
    await this.prisma.idempotencyRecord.updateMany({
      where: { id: row.id, status: IDEMPOTENCY_PENDING_STATUS },
      data: { status, body: envelope(hash, body) },
    });
  }

  async abort(userId: string, key: string, route: string, hash: string): Promise<void> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key_route: { userId, key, route } },
    });
    const stored = row ? readEnvelope(row.body) : null;
    if (!row || row.status !== IDEMPOTENCY_PENDING_STATUS || stored?.hash !== hash) return;
    await this.prisma.idempotencyRecord.deleteMany({
      where: { id: row.id, status: IDEMPOTENCY_PENDING_STATUS },
    });
  }

  private decide(decision: IdempotencyDecision): IdempotencyBegin {
    if (decision.kind === 'replay') return { kind: 'replay', body: decision.body };
    if (decision.kind === 'mismatch') {
      throw new TesseraHttpError(
        409,
        'IDEMPOTENCY_MISMATCH',
        'This Idempotency-Key was already used with a different request.',
      );
    }
    if (decision.kind === 'legacy') {
      throw new TesseraHttpError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used.',
      );
    }
    throw new TesseraHttpError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is still running.',
    );
  }
}

import { TesseraHttpError } from './http-error.js';

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = raw.lastIndexOf('|');
  const iso = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  const createdAt = new Date(iso);
  if (!iso || !id || Number.isNaN(createdAt.getTime())) {
    throw new TesseraHttpError(400, 'VALIDATION', 'Invalid cursor');
  }
  return { createdAt, id };
}

export function cursorWhere(cursor: string | undefined):
  | { OR: Array<Record<string, unknown>> }
  | undefined {
  if (!cursor) return undefined;
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export function cursorWherePublished(cursor: string | undefined):
  | { OR: Array<Record<string, unknown>> }
  | undefined {
  if (!cursor) return undefined;
  const { createdAt: publishedAt, id } = decodeCursor(cursor);
  return {
    OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: id } }],
  };
}

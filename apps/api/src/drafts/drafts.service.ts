import { Injectable } from '@nestjs/common';
import { Prisma } from '@tessera/db';
import type { DraftView, Paginated } from '@tessera/types';
import type { CreateDraftInput, UpdateDraftInput } from '@tessera/validation';
import { MAX_DRAFTS_PER_USER } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { cursorWhere, encodeCursor } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    opts: { cursor?: string; limit: number; kind?: 'post' | 'loop' | 'moment' },
  ): Promise<Paginated<DraftView>> {
    const extra = cursorWhere(opts.cursor);
    const rows = await this.prisma.draft.findMany({
      where: {
        userId,
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(extra ?? {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
    });
    const slice = rows.slice(0, opts.limit);
    const last = slice[slice.length - 1];
    return {
      items: slice.map(toView),
      nextCursor: rows.length > opts.limit && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async get(userId: string, id: string): Promise<DraftView> {
    return toView(await this.requireOwned(userId, id));
  }

  async create(userId: string, input: CreateDraftInput): Promise<DraftView> {
    const count = await this.prisma.draft.count({ where: { userId } });
    if (count >= MAX_DRAFTS_PER_USER) {
      throw new TesseraHttpError(400, 'DRAFT_LIMIT', `You can keep ${MAX_DRAFTS_PER_USER} drafts.`);
    }
    const row = await this.prisma.draft.create({
      data: { userId, kind: input.kind, payload: input.payload as Prisma.InputJsonValue },
    });
    return toView(row);
  }

  async update(userId: string, id: string, input: UpdateDraftInput): Promise<DraftView> {
    await this.requireOwned(userId, id);
    const row = await this.prisma.draft.update({
      where: { id },
      data: {
        kind: input.kind,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
    return toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    await this.prisma.draft.delete({ where: { id } });
  }

  private async requireOwned(userId: string, id: string) {
    const row = await this.prisma.draft.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Draft not found.');
    }
    return row;
  }
}

function toView(row: {
  id: string;
  kind: 'post' | 'loop' | 'moment';
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DraftView {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

import { Injectable } from '@nestjs/common';
import { DEFAULT_SAVED_BOARD_TITLE, MAX_BOARDS_PER_USER, indexBoard } from '@tessera/media';
import type {
  BoardCard,
  BoardCollaboratorView,
  BoardDetail,
  BoardSaveResult,
  BoardSearchPage,
} from '@tessera/types';
import type { CreateBoardInput, SaveToBoardInput, UpdateBoardInput } from '@tessera/validation';
import { TesseraHttpError } from '../common/http-error.js';
import { cursorWhere, encodeCursor } from '../common/pagination.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { POST_INCLUDE, PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';

const BOARD_INCLUDE = {
  owner: { include: { profile: true } },
  _count: { select: { items: true, follows: true } },
} as const;

type BoardRow = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: 'private' | 'shared' | 'public';
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; handle: string; profile: { displayName: string; avatarKey: string | null } | null };
  _count: { items: number; follows: number };
};

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly posts: PostsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async listMine(userId: string): Promise<{ items: BoardCard[] }> {
    await this.ensureDefaultBoard(userId);
    const owned = await this.prisma.board.findMany({
      where: { ownerId: userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      include: BOARD_INCLUDE,
    });
    const collab = await this.prisma.boardCollaborator.findMany({
      where: { userId, acceptedAt: { not: null } },
      include: { board: { include: BOARD_INCLUDE } },
    });
    const pending = await this.prisma.boardCollaborator.findMany({
      where: { userId, acceptedAt: null },
      include: { board: { include: BOARD_INCLUDE } },
    });
    const seen = new Set<string>();
    const items: BoardCard[] = [];
    for (const row of [...owned, ...collab.map((c) => c.board), ...pending.map((c) => c.board)]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(await this.toCard(row, userId));
    }
    return { items };
  }

  async listFollowing(userId: string): Promise<{ items: BoardCard[] }> {
    const rows = await this.prisma.boardFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { board: { include: BOARD_INCLUDE } },
    });
    const items: BoardCard[] = [];
    for (const row of rows) items.push(await this.toCard(row.board, userId));
    return { items };
  }

  async listPublicForHandle(handle: string, viewerId?: string): Promise<{ items: BoardCard[] }> {
    const user = await this.users.loadByHandle(handle);
    if (viewerId && (await this.users.isBlockedEitherWay(viewerId, user.id))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    const rows = await this.prisma.board.findMany({
      where: { ownerId: user.id, visibility: 'public' },
      orderBy: { updatedAt: 'desc' },
      include: BOARD_INCLUDE,
    });
    const items: BoardCard[] = [];
    for (const row of rows) items.push(await this.toCard(row, viewerId));
    return { items };
  }

  async get(id: string, viewerId: string | undefined, cursor?: string, limit = 24): Promise<BoardDetail> {
    const board = await this.prisma.board.findUnique({ where: { id }, include: BOARD_INCLUDE });
    if (!board) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    await this.assertCanView(board, viewerId);
    const extra = cursorWhere(cursor);
    const rows = await this.prisma.boardItem.findMany({
      where: { boardId: board.id, ...(extra ?? {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        addedBy: { include: { profile: true } },
        post: { include: POST_INCLUDE },
      },
    });
    const slice = rows.slice(0, limit);
    const items = [];
    for (const row of slice) {
      try {
        const post = await this.posts.mapPost(row.post, viewerId);
        items.push({
          id: row.id,
          post,
          addedBy: {
            id: row.addedBy.id,
            handle: row.addedBy.handle,
            displayName: row.addedBy.profile?.displayName ?? row.addedBy.handle,
            avatarUrl: await this.storage.signGet(row.addedBy.profile?.avatarKey ?? null),
          },
          createdAt: row.createdAt.toISOString(),
        });
      } catch {
        /* hidden post */
      }
    }
    const collaborators = await this.listCollaborators(board.id, viewerId, board.ownerId);
    const last = slice[slice.length - 1];
    return {
      ...(await this.toCard(board, viewerId)),
      items,
      collaborators,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, input: CreateBoardInput): Promise<BoardCard> {
    await this.ensureDefaultBoard(userId);
    const count = await this.prisma.board.count({ where: { ownerId: userId } });
    if (count >= MAX_BOARDS_PER_USER) {
      throw new TesseraHttpError(400, 'BOARD_LIMIT', `You can have ${MAX_BOARDS_PER_USER} Boards.`);
    }
    const row = await this.prisma.board.create({
      data: {
        ownerId: userId,
        title: input.title.trim(),
        description: input.description,
        visibility: input.visibility,
      },
      include: BOARD_INCLUDE,
    });
    await indexBoard(this.prisma, row.id);
    return this.toCard(row, userId);
  }

  async update(userId: string, id: string, input: UpdateBoardInput): Promise<BoardCard> {
    const board = await this.requireOwner(userId, id);
    if (board.isDefault && input.title !== undefined && input.title.trim() !== board.title) {
      // Default board can be renamed.
    }
    const row = await this.prisma.board.update({
      where: { id: board.id },
      data: {
        title: input.title?.trim(),
        description: input.description,
        visibility: input.visibility,
      },
      include: BOARD_INCLUDE,
    });
    await indexBoard(this.prisma, row.id);
    return this.toCard(row, userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const board = await this.requireOwner(userId, id);
    if (board.isDefault) {
      throw new TesseraHttpError(400, 'DEFAULT_BOARD', 'The Saved board cannot be deleted.');
    }
    await this.prisma.board.delete({ where: { id: board.id } });
    await indexBoard(this.prisma, id);
  }

  async savePost(userId: string, postId: string, input: SaveToBoardInput = {}): Promise<BoardSaveResult> {
    await this.posts.get(postId, userId);
    const board = input.boardId
      ? await this.requireCanAdd(userId, input.boardId)
      : await this.ensureDefaultBoard(userId);
    const item = await this.prisma.boardItem.upsert({
      where: { boardId_postId: { boardId: board.id, postId } },
      create: { boardId: board.id, postId, addedById: userId },
      update: {},
    });
    await this.prisma.board.update({ where: { id: board.id }, data: { updatedAt: new Date() } });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    return {
      board: await this.toCard(fresh, userId),
      item: { id: item.id, postId, createdAt: item.createdAt.toISOString() },
    };
  }

  async removeItem(userId: string, boardId: string, postId: string): Promise<BoardCard> {
    const board = await this.requireCanAdd(userId, boardId);
    await this.prisma.boardItem.deleteMany({ where: { boardId: board.id, postId } });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    return this.toCard(fresh, userId);
  }

  async follow(userId: string, id: string): Promise<BoardCard> {
    const board = await this.prisma.board.findUnique({ where: { id }, include: BOARD_INCLUDE });
    if (!board) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    if (board.visibility !== 'public') {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'Only public Boards can be followed.');
    }
    if (board.ownerId === userId) {
      throw new TesseraHttpError(400, 'SELF', 'You already own this Board.');
    }
    if (await this.users.isBlockedEitherWay(userId, board.ownerId)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    }
    await this.prisma.boardFollow.upsert({
      where: { boardId_userId: { boardId: board.id, userId } },
      create: { boardId: board.id, userId },
      update: {},
    });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    return this.toCard(fresh, userId);
  }

  async unfollow(userId: string, id: string): Promise<BoardCard> {
    const board = await this.prisma.board.findUnique({ where: { id }, include: BOARD_INCLUDE });
    if (!board) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    await this.prisma.boardFollow.deleteMany({ where: { boardId: board.id, userId } });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    return this.toCard(fresh, userId);
  }

  async invite(userId: string, id: string, handle: string): Promise<BoardCard> {
    const board = await this.requireOwner(userId, id);
    const target = await this.users.loadByHandle(handle);
    if (target.id === userId) {
      throw new TesseraHttpError(400, 'SELF', 'You already own this Board.');
    }
    if (await this.users.isBlockedEitherWay(userId, target.id)) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'No account with that handle.');
    }
    if (board.visibility === 'private') {
      await this.prisma.board.update({ where: { id: board.id }, data: { visibility: 'shared' } });
    }
    await this.prisma.boardCollaborator.upsert({
      where: { boardId_userId: { boardId: board.id, userId: target.id } },
      create: { boardId: board.id, userId: target.id },
      update: { invitedAt: new Date(), acceptedAt: null },
    });
    await this.notifications.notify({
      recipientId: target.id,
      actorId: userId,
      kind: 'board_invite',
      targetType: 'board',
      targetId: board.id,
      payload: { boardId: board.id, title: board.title },
    });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    await indexBoard(this.prisma, board.id);
    return this.toCard(fresh, userId);
  }

  async acceptInvite(userId: string, id: string): Promise<BoardCard> {
    const collab = await this.prisma.boardCollaborator.findUnique({
      where: { boardId_userId: { boardId: id, userId } },
    });
    if (!collab) throw new TesseraHttpError(404, 'NOT_FOUND', 'No invite for that Board.');
    await this.prisma.boardCollaborator.update({
      where: { boardId_userId: { boardId: id, userId } },
      data: { acceptedAt: new Date() },
    });
    const board = await this.prisma.board.findUniqueOrThrow({ where: { id }, include: BOARD_INCLUDE });
    return this.toCard(board, userId);
  }

  async declineInvite(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.boardCollaborator.deleteMany({
      where: { boardId: id, userId, acceptedAt: null },
    });
    return { ok: true };
  }

  async removeCollaborator(userId: string, id: string, handle: string): Promise<BoardCard> {
    const board = await this.requireOwner(userId, id);
    const target = await this.users.loadByHandle(handle);
    await this.prisma.boardCollaborator.deleteMany({
      where: { boardId: board.id, userId: target.id },
    });
    const fresh = await this.prisma.board.findUniqueOrThrow({
      where: { id: board.id },
      include: BOARD_INCLUDE,
    });
    return this.toCard(fresh, userId);
  }

  async search(userId: string, q: string, limit: number): Promise<BoardSearchPage> {
    const term = q.replace(/[%_]/g, '').trim();
    const rows = await this.prisma.board.findMany({
      where: {
        visibility: 'public',
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: BOARD_INCLUDE,
    });
    const items: BoardCard[] = [];
    for (const row of rows) {
      if (await this.users.isBlockedEitherWay(userId, row.ownerId)) continue;
      items.push(await this.toCard(row, userId));
    }
    return { query: q, engine: 'postgres', items, nextCursor: null };
  }

  async searchHits(userId: string, q: string, limit: number): Promise<BoardCard[]> {
    const page = await this.search(userId, q, limit);
    return page.items;
  }

  async cardsByIds(userId: string, ids: string[]): Promise<BoardCard[]> {
    const items: BoardCard[] = [];
    for (const id of ids) {
      const row = await this.prisma.board.findUnique({ where: { id }, include: BOARD_INCLUDE });
      if (!row) continue;
      try {
        await this.assertCanView(row, userId);
        items.push(await this.toCard(row, userId));
      } catch {
        /* hidden */
      }
    }
    return items;
  }

  async ensureDefaultBoard(userId: string): Promise<BoardRow> {
    const existing = await this.prisma.board.findFirst({
      where: { ownerId: userId, isDefault: true },
      include: BOARD_INCLUDE,
    });
    if (existing) return existing;
    return this.prisma.board.create({
      data: {
        ownerId: userId,
        title: DEFAULT_SAVED_BOARD_TITLE,
        visibility: 'private',
        isDefault: true,
      },
      include: BOARD_INCLUDE,
    });
  }

  private async requireOwner(userId: string, id: string) {
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    if (board.ownerId !== userId) throw new TesseraHttpError(403, 'FORBIDDEN', 'Only the owner can do that.');
    return board;
  }

  private async requireCanAdd(userId: string, id: string) {
    const board = await this.prisma.board.findUnique({ where: { id }, include: BOARD_INCLUDE });
    if (!board) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    if (board.ownerId === userId) return board;
    const collab = await this.prisma.boardCollaborator.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    });
    if (!collab?.acceptedAt) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'You cannot add to this Board.');
    }
    return board;
  }

  private async assertCanView(
    board: { id: string; ownerId: string; visibility: 'private' | 'shared' | 'public' },
    viewerId?: string,
  ): Promise<void> {
    if (viewerId && (await this.users.isBlockedEitherWay(viewerId, board.ownerId))) {
      throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    }
    if (board.visibility === 'public') return;
    if (!viewerId) throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
    if (board.ownerId === viewerId) return;
    const collab = await this.prisma.boardCollaborator.findUnique({
      where: { boardId_userId: { boardId: board.id, userId: viewerId } },
    });
    if (collab) return;
    throw new TesseraHttpError(404, 'NOT_FOUND', 'Board not found.');
  }

  private async listCollaborators(
    boardId: string,
    viewerId: string | undefined,
    ownerId: string,
  ): Promise<BoardCollaboratorView[]> {
    if (viewerId !== ownerId) return [];
    const rows = await this.prisma.boardCollaborator.findMany({
      where: { boardId },
      include: { user: { include: { profile: true } } },
      orderBy: { invitedAt: 'asc' },
    });
    const items: BoardCollaboratorView[] = [];
    for (const row of rows) {
      items.push({
        id: row.user.id,
        handle: row.user.handle,
        displayName: row.user.profile?.displayName ?? row.user.handle,
        avatarUrl: await this.storage.signGet(row.user.profile?.avatarKey ?? null),
        accepted: Boolean(row.acceptedAt),
        invitedAt: row.invitedAt.toISOString(),
      });
    }
    return items;
  }

  private async toCard(board: BoardRow, viewerId?: string): Promise<BoardCard> {
    const collab = viewerId
      ? await this.prisma.boardCollaborator.findUnique({
          where: { boardId_userId: { boardId: board.id, userId: viewerId } },
        })
      : null;
    const follow = viewerId
      ? await this.prisma.boardFollow.findUnique({
          where: { boardId_userId: { boardId: board.id, userId: viewerId } },
        })
      : null;
    const isOwner = viewerId === board.ownerId;
    const isCollaborator = Boolean(collab?.acceptedAt);
    const cover = await this.prisma.boardItem.findFirst({
      where: { boardId: board.id },
      orderBy: { createdAt: 'desc' },
      include: { post: { include: { media: { orderBy: { sortOrder: 'asc' }, take: 1 } } } },
    });
    const coverKey = cover?.post.media[0]?.originalKey ?? null;
    const variant = cover?.post.media[0]?.variants as { widths?: Record<string, { webp?: string }> } | null;
    const coverUrl = variant?.widths?.['320']?.webp
      ? await this.storage.signGet(variant.widths['320'].webp)
      : await this.storage.signGet(coverKey);
    return {
      id: board.id,
      title: board.title,
      description: board.description,
      visibility: board.visibility,
      isDefault: board.isDefault,
      owner: {
        id: board.owner.id,
        handle: board.owner.handle,
        displayName: board.owner.profile?.displayName ?? board.owner.handle,
        avatarUrl: await this.storage.signGet(board.owner.profile?.avatarKey ?? null),
      },
      itemCount: board._count.items,
      followerCount: board._count.follows,
      coverUrl,
      viewer: {
        isOwner,
        isCollaborator,
        pendingInvite: Boolean(collab && !collab.acceptedAt),
        isFollower: Boolean(follow),
        canAdd: isOwner || isCollaborator,
      },
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }
}

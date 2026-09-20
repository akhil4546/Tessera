import { z } from 'zod';

export const MAX_BOARD_TITLE = 80;
export const MAX_BOARD_DESCRIPTION = 300;
export const MAX_BOARDS_PER_USER = 40;

export const boardVisibilitySchema = z.enum(['private', 'shared', 'public']);

export const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(MAX_BOARD_TITLE),
  description: z.string().trim().max(MAX_BOARD_DESCRIPTION).default(''),
  visibility: boardVisibilitySchema.default('private'),
});

export const updateBoardSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_BOARD_TITLE).optional(),
    description: z.string().trim().max(MAX_BOARD_DESCRIPTION).optional(),
    visibility: boardVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const saveToBoardSchema = z.object({
  boardId: z.string().min(1).optional(),
});

export const boardCollaboratorSchema = z.object({
  handle: z.string().trim().min(2).max(30),
});

export const boardSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const boardItemsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export type CreateBoardInput = z.output<typeof createBoardSchema>;
export type UpdateBoardInput = z.output<typeof updateBoardSchema>;
export type SaveToBoardInput = z.output<typeof saveToBoardSchema>;

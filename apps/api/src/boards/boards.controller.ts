import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  boardCollaboratorSchema,
  boardItemsQuerySchema,
  boardSearchQuerySchema,
  createBoardSchema,
  saveToBoardSchema,
  updateBoardSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { BoardsService } from './boards.service.js';

@ApiTags('boards')
@Controller('v1')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get('me/boards')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  mine(@CurrentUser() user: RequestUser) {
    return this.boards.listMine(user.id);
  }

  @Get('me/boards/following')
  @UseGuards(AuthGuard)
  following(@CurrentUser() user: RequestUser) {
    return this.boards.listFollowing(user.id);
  }

  @Post('boards')
  @UseGuards(AuthGuard)
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createBoardSchema)) body: ReturnType<typeof createBoardSchema.parse>,
  ) {
    return this.boards.create(user.id, body);
  }

  @Get('boards/:id')
  @UseGuards(OptionalAuthGuard)
  get(
    @Param('id') id: string,
    @Query(new ZodPipe(boardItemsQuerySchema)) query: ReturnType<typeof boardItemsQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.boards.get(id, viewer?.id, query.cursor, query.limit);
  }

  @Patch('boards/:id')
  @UseGuards(AuthGuard)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateBoardSchema)) body: ReturnType<typeof updateBoardSchema.parse>,
  ) {
    return this.boards.update(user.id, id, body);
  }

  @Delete('boards/:id')
  @UseGuards(AuthGuard)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.boards.remove(user.id, id);
    return { ok: true };
  }

  @Post('posts/:id/save')
  @UseGuards(AuthGuard)
  savePost(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(saveToBoardSchema)) body: ReturnType<typeof saveToBoardSchema.parse>,
  ) {
    return this.boards.savePost(user.id, id, body);
  }

  @Post('loops/:id/save')
  @UseGuards(AuthGuard)
  saveLoop(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(saveToBoardSchema)) body: ReturnType<typeof saveToBoardSchema.parse>,
  ) {
    return this.boards.savePost(user.id, id, body);
  }

  @Delete('boards/:id/items/:postId')
  @UseGuards(AuthGuard)
  removeItem(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ) {
    return this.boards.removeItem(user.id, id, postId);
  }

  @Post('boards/:id/follow')
  @UseGuards(AuthGuard)
  follow(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.boards.follow(user.id, id);
  }

  @Delete('boards/:id/follow')
  @UseGuards(AuthGuard)
  unfollow(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.boards.unfollow(user.id, id);
  }

  @Post('boards/:id/collaborators')
  @UseGuards(AuthGuard)
  invite(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(boardCollaboratorSchema)) body: ReturnType<typeof boardCollaboratorSchema.parse>,
  ) {
    return this.boards.invite(user.id, id, body.handle);
  }

  @Post('boards/:id/accept')
  @UseGuards(AuthGuard)
  accept(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.boards.acceptInvite(user.id, id);
  }

  @Post('boards/:id/decline')
  @UseGuards(AuthGuard)
  decline(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.boards.declineInvite(user.id, id);
  }

  @Delete('boards/:id/collaborators/:handle')
  @UseGuards(AuthGuard)
  removeCollaborator(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('handle') handle: string,
  ) {
    return this.boards.removeCollaborator(user.id, id, handle);
  }

  @Get('users/:handle/boards')
  @UseGuards(OptionalAuthGuard)
  publicBoards(@Param('handle') handle: string, @OptionalUser() viewer?: RequestUser) {
    return this.boards.listPublicForHandle(handle, viewer?.id);
  }

  @Get('search/boards')
  @UseGuards(AuthGuard)
  search(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(boardSearchQuerySchema)) query: ReturnType<typeof boardSearchQuerySchema.parse>,
  ) {
    return this.boards.search(user.id, query.q, query.limit);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  appreciateSchema,
  avatarSchema,
  commentFilterSchema,
  createCommentSchema,
  createPostSchema,
  heroTilesSchema,
  mosaicQuerySchema,
  paginationQuerySchema,
  updatePostSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { UsersService } from '../users/users.service.js';
import { CommentsService } from './comments.service.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@Controller('v1')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly comments: CommentsService,
    private readonly users: UsersService,
  ) {}

  @Post('posts')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createPostSchema)) body: ReturnType<typeof createPostSchema.parse>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.posts.create(user.id, body, idempotencyKey);
  }

  @Get('posts/:id')
  @UseGuards(OptionalAuthGuard)
  get(@Param('id') id: string, @OptionalUser() viewer?: RequestUser) {
    return this.posts.get(id, viewer?.id);
  }

  @Patch('posts/:id')
  @UseGuards(AuthGuard)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updatePostSchema)) body: ReturnType<typeof updatePostSchema.parse>,
  ) {
    return this.posts.update(user.id, id, body);
  }

  @Delete('posts/:id')
  @UseGuards(AuthGuard)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.posts.remove(user.id, id);
    return { ok: true };
  }

  @Post('posts/:id/archive')
  @UseGuards(AuthGuard)
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.posts.archive(user.id, id);
  }

  @Post('posts/:id/appreciations')
  @UseGuards(AuthGuard)
  appreciate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(appreciateSchema)) body: ReturnType<typeof appreciateSchema.parse>,
  ) {
    return this.posts.appreciate(user.id, id, body.type);
  }

  @Delete('posts/:id/appreciations')
  @UseGuards(AuthGuard)
  unappreciate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.posts.unappreciate(user.id, id);
  }

  @Get('posts/:id/comments')
  @UseGuards(OptionalAuthGuard)
  commentsList(
    @Param('id') id: string,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.comments.list(id, viewer?.id, query.cursor, query.limit);
  }

  @Post('posts/:id/comments')
  @UseGuards(AuthGuard)
  commentCreate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(createCommentSchema)) body: ReturnType<typeof createCommentSchema.parse>,
  ) {
    return this.comments.create(user.id, id, body.body, body.parentId);
  }

  @Delete('comments/:id')
  @UseGuards(AuthGuard)
  async commentRemove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.comments.remove(user.id, id);
    return { ok: true };
  }

  @Post('comments/:id/pin')
  @UseGuards(AuthGuard)
  pin(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.comments.pin(user.id, id, true);
  }

  @Delete('comments/:id/pin')
  @UseGuards(AuthGuard)
  unpin(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.comments.pin(user.id, id, false);
  }

  @Post('comments/:id/approve')
  @UseGuards(AuthGuard)
  approveRestricted(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.comments.approveRestricted(user.id, id);
  }

  @Post('comments/:id/like')
  @UseGuards(AuthGuard)
  like(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.comments.like(user.id, id, true);
  }

  @Delete('comments/:id/like')
  @UseGuards(AuthGuard)
  unlike(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.comments.like(user.id, id, false);
  }

  @Get('me/comment-filters')
  @UseGuards(AuthGuard)
  filters(@CurrentUser() user: RequestUser) {
    return this.comments.listFilters(user.id);
  }

  @Put('me/comment-filters')
  @UseGuards(AuthGuard)
  setFilters(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(commentFilterSchema)) body: ReturnType<typeof commentFilterSchema.parse>,
  ) {
    return this.comments.setFilters(user.id, body.keywords);
  }

  @Put('me/hero-tiles')
  @UseGuards(AuthGuard)
  hero(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(heroTilesSchema)) body: ReturnType<typeof heroTilesSchema.parse>,
  ) {
    return this.posts.setHeroTiles(user.id, body.postIds);
  }

  @Post('me/avatar')
  @UseGuards(AuthGuard)
  avatar(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(avatarSchema)) body: ReturnType<typeof avatarSchema.parse>,
  ) {
    return this.users.setAvatar(user.id, body.mediaId);
  }

  @Get('me/scheduled')
  @UseGuards(AuthGuard)
  scheduled(@CurrentUser() user: RequestUser) {
    return this.posts.listScheduled(user.id);
  }

  @Get('users/:handle/mosaic')
  @UseGuards(OptionalAuthGuard)
  mosaic(
    @Param('handle') handle: string,
    @Query(new ZodPipe(mosaicQuerySchema)) query: ReturnType<typeof mosaicQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.posts.mosaic(handle, viewer?.id, query.cursor, query.limit);
  }
}

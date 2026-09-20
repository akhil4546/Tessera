import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { muteBodySchema, paginationQuerySchema } from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { GraphService } from './graph.service.js';

@ApiTags('graph')
@ApiCookieAuth()
@Controller('v1')
@UseGuards(AuthGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Post('users/:handle/follow')
  follow(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.follow(user.id, handle);
  }

  @Delete('users/:handle/follow')
  unfollow(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.unfollow(user.id, handle);
  }

  @Post('users/:handle/follow/accept')
  accept(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.accept(user.id, handle);
  }

  @Post('users/:handle/follow/decline')
  async decline(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    await this.graph.decline(user.id, handle);
    return { ok: true };
  }

  @Delete('users/:handle/follower')
  removeFollower(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.removeFollower(user.id, handle);
  }

  @Get('me/follow-requests')
  followRequests(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
  ) {
    return this.graph.listFollowRequests(user.id, query.cursor, query.limit);
  }

  @Post('users/:handle/block')
  block(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.block(user.id, handle);
  }

  @Delete('users/:handle/block')
  unblock(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.unblock(user.id, handle);
  }

  @Post('users/:handle/mute')
  mute(
    @CurrentUser() user: RequestUser,
    @Param('handle') handle: string,
    @Body(new ZodPipe(muteBodySchema)) body: ReturnType<typeof muteBodySchema.parse>,
  ) {
    return this.graph.mute(user.id, handle, body.scope);
  }

  @Delete('users/:handle/mute')
  unmute(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.unmute(user.id, handle);
  }

  @Get('me/blocked')
  blocked(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
  ) {
    return this.graph.listBlocked(user.id, query.cursor, query.limit);
  }

  @Post('users/:handle/restrict')
  restrict(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.restrict(user.id, handle);
  }

  @Delete('users/:handle/restrict')
  unrestrict(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.graph.unrestrict(user.id, handle);
  }

  @Get('me/restricted')
  restricted(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
  ) {
    return this.graph.listRestricted(user.id, query.cursor, query.limit);
  }

  @Get('me/muted')
  muted(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
  ) {
    return this.graph.listMuted(user.id, query.cursor, query.limit);
  }
}

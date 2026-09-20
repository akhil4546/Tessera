import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationQuerySchema,
  updateHandleSchema,
  updatePrivacySchema,
  updateProfileSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('v1')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'The signed-in profile' })
  me(@CurrentUser() user: RequestUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateProfileSchema)) body: ReturnType<typeof updateProfileSchema.parse>,
  ) {
    return this.users.updateMe(user.id, body);
  }

  @Patch('me/handle')
  @UseGuards(AuthGuard)
  updateHandle(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateHandleSchema)) body: ReturnType<typeof updateHandleSchema.parse>,
  ) {
    return this.users.updateHandle(user.id, body.handle);
  }

  @Patch('me/privacy')
  @UseGuards(AuthGuard)
  updatePrivacy(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updatePrivacySchema)) body: ReturnType<typeof updatePrivacySchema.parse>,
  ) {
    return this.users.updatePrivacy(user.id, body);
  }

  @Get('me/sessions')
  @UseGuards(AuthGuard)
  sessions(@CurrentUser() user: RequestUser) {
    return this.users.listSessions(user.id, user.sessionId);
  }

  @Delete('me/sessions/:id')
  @UseGuards(AuthGuard)
  async revokeSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.users.revokeSession(user.id, id, user.sessionId);
    return { ok: true };
  }

  @Post('me/sessions/revoke-others')
  @UseGuards(AuthGuard)
  async revokeOthers(@CurrentUser() user: RequestUser) {
    const revoked = await this.users.revokeOtherSessions(user.id, user.sessionId);
    return { revoked };
  }

  @Get('users/:handle')
  @UseGuards(OptionalAuthGuard)
  byHandle(@Param('handle') handle: string, @OptionalUser() viewer?: RequestUser) {
    return this.users.getPublicByHandle(handle, viewer?.id);
  }

  @Get('users/:handle/followers')
  @UseGuards(OptionalAuthGuard)
  followers(
    @Param('handle') handle: string,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.users.listFollowers(handle, viewer?.id, query.cursor, query.limit);
  }

  @Get('users/:handle/following')
  @UseGuards(OptionalAuthGuard)
  following(
    @Param('handle') handle: string,
    @Query(new ZodPipe(paginationQuerySchema)) query: ReturnType<typeof paginationQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.users.listFollowing(handle, viewer?.id, query.cursor, query.limit);
  }
}

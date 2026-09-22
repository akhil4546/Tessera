import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  createMomentSchema,
  createReelShelfSchema,
  keepMomentSchema,
  momentReactionSchema,
  reelShelfOrderSchema,
  stickerResponseSchema,
  updateReelShelfSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { InboxService } from '../inbox/inbox.service.js';
import { MomentsService } from './moments.service.js';

@ApiTags('moments')
@Controller('v1')
export class MomentsController {
  constructor(
    private readonly moments: MomentsService,
    private readonly inbox: InboxService,
  ) {}

  @Post('moments')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createMomentSchema)) body: ReturnType<typeof createMomentSchema.parse>,
  ) {
    return this.moments.create(user.id, body);
  }

  @Get('moments/tray')
  @UseGuards(AuthGuard)
  tray(@CurrentUser() user: RequestUser) {
    return this.moments.tray(user.id);
  }

  @Get('me/moments/archive')
  @UseGuards(AuthGuard)
  archive(@CurrentUser() user: RequestUser) {
    return this.moments.archive(user.id);
  }

  @Get('moments/authors/:handle')
  @UseGuards(OptionalAuthGuard)
  authorReel(@Param('handle') handle: string, @OptionalUser() viewer?: RequestUser) {
    return this.moments.authorReel(handle, viewer?.id);
  }

  @Get('moments/:id')
  @UseGuards(OptionalAuthGuard)
  get(@Param('id') id: string, @OptionalUser() viewer?: RequestUser) {
    return this.moments.get(id, viewer?.id);
  }

  @Delete('moments/:id')
  @UseGuards(AuthGuard)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.moments.remove(user.id, id);
    return { ok: true };
  }

  @Post('moments/:id/segments/:segmentId/view')
  @UseGuards(AuthGuard)
  view(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('segmentId') segmentId: string,
  ) {
    return this.moments.markViewed(user.id, id, segmentId);
  }

  @Post('moments/:id/segments/:segmentId/reactions')
  @UseGuards(AuthGuard)
  react(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('segmentId') segmentId: string,
    @Body(new ZodPipe(momentReactionSchema)) body: ReturnType<typeof momentReactionSchema.parse>,
  ) {
    return this.moments.react(user.id, id, segmentId, body.emoji);
  }

  @Delete('moments/:id/segments/:segmentId/reactions')
  @UseGuards(AuthGuard)
  unreact(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('segmentId') segmentId: string,
  ) {
    return this.moments.unreact(user.id, id, segmentId);
  }

  @Get('moments/:id/viewers')
  @UseGuards(AuthGuard)
  viewers(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.moments.viewers(user.id, id);
  }

  @Post('moments/:id/stickers/:stickerId/responses')
  @UseGuards(AuthGuard)
  respond(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Body(new ZodPipe(stickerResponseSchema)) body: ReturnType<typeof stickerResponseSchema.parse>,
  ) {
    return this.moments.respond(user.id, id, stickerId, body);
  }

  @Post('moments/:id/keep')
  @UseGuards(AuthGuard)
  keep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(keepMomentSchema)) body: ReturnType<typeof keepMomentSchema.parse>,
  ) {
    return this.moments.keep(user.id, id, body);
  }

  @Post('moments/:id/reply')
  @UseGuards(AuthGuard)
  reply(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.inbox.replyToMoment(user.id, id);
  }

  @Post('me/reel-shelves')
  @UseGuards(AuthGuard)
  createShelf(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createReelShelfSchema)) body: ReturnType<typeof createReelShelfSchema.parse>,
  ) {
    return this.moments.createShelf(user.id, body.title);
  }

  @Get('me/reel-shelves')
  @UseGuards(AuthGuard)
  myShelves(@CurrentUser() user: RequestUser) {
    return this.moments.listMyShelves(user.id);
  }

  @Put('me/reel-shelves/order')
  @UseGuards(AuthGuard)
  order(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(reelShelfOrderSchema)) body: ReturnType<typeof reelShelfOrderSchema.parse>,
  ) {
    return this.moments.orderShelves(user.id, body.shelfIds);
  }

  @Patch('me/reel-shelves/:id')
  @UseGuards(AuthGuard)
  updateShelf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateReelShelfSchema)) body: ReturnType<typeof updateReelShelfSchema.parse>,
  ) {
    return this.moments.updateShelf(user.id, id, body);
  }

  @Delete('me/reel-shelves/:id')
  @UseGuards(AuthGuard)
  async deleteShelf(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.moments.deleteShelf(user.id, id);
    return { ok: true };
  }

  @Get('users/:handle/reel-shelves')
  @UseGuards(OptionalAuthGuard)
  publicShelves(@Param('handle') handle: string, @OptionalUser() viewer?: RequestUser) {
    return this.moments.listPublicShelves(handle, viewer?.id);
  }

  @Get('users/:handle/reel-shelves/:id')
  @UseGuards(OptionalAuthGuard)
  publicShelf(
    @Param('handle') handle: string,
    @Param('id') id: string,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.moments.publicShelf(handle, id, viewer?.id);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  audioQuerySchema,
  createLoopSchema,
  loopsFeedQuerySchema,
  updateLoopSchema,
  watchLoopSchema,
  wellbeingUpdateSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { LoopsService } from './loops.service.js';

@ApiTags('loops')
@Controller('v1')
export class LoopsController {
  constructor(private readonly loops: LoopsService) {}

  @Post('loops')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createLoopSchema)) body: ReturnType<typeof createLoopSchema.parse>,
  ) {
    return this.loops.create(user.id, body);
  }

  @Get('loops/feed')
  @UseGuards(AuthGuard)
  feed(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(loopsFeedQuerySchema)) query: ReturnType<typeof loopsFeedQuerySchema.parse>,
  ) {
    return this.loops.feed(user.id, { cursor: query.cursor, limit: query.limit });
  }

  @Get('audio')
  @UseGuards(AuthGuard)
  audio(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(audioQuerySchema)) query: ReturnType<typeof audioQuerySchema.parse>,
  ) {
    return this.loops.listAudio(user.id, { cursor: query.cursor, limit: query.limit, q: query.q });
  }

  @Get('me/wellbeing')
  @UseGuards(AuthGuard)
  wellbeing(@CurrentUser() user: RequestUser) {
    return this.loops.wellbeing(user.id);
  }

  @Put('me/wellbeing')
  @UseGuards(AuthGuard)
  setBudget(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(wellbeingUpdateSchema)) body: ReturnType<typeof wellbeingUpdateSchema.parse>,
  ) {
    return this.loops.setBudget(user.id, body);
  }

  @Post('me/wellbeing/extend')
  @UseGuards(AuthGuard)
  extend(@CurrentUser() user: RequestUser) {
    return this.loops.extendBudget(user.id);
  }

  @Post('me/wellbeing/dismiss')
  @UseGuards(AuthGuard)
  dismiss(@CurrentUser() user: RequestUser) {
    return this.loops.dismissBudget(user.id);
  }

  @Get('loops/:id')
  @UseGuards(OptionalAuthGuard)
  get(@Param('id') id: string, @OptionalUser() viewer?: RequestUser) {
    return this.loops.get(id, viewer?.id);
  }

  @Patch('loops/:id')
  @UseGuards(AuthGuard)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateLoopSchema)) body: ReturnType<typeof updateLoopSchema.parse>,
  ) {
    return this.loops.update(user.id, id, body);
  }

  @Post('loops/:id/watch')
  @UseGuards(AuthGuard)
  watch(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(watchLoopSchema)) body: ReturnType<typeof watchLoopSchema.parse>,
  ) {
    return this.loops.watch(user.id, id, body.seconds);
  }
}

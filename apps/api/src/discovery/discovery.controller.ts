import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  discoverFeedQuerySchema,
  hashtagParamSchema,
  hashtagQuerySchema,
  placeQuerySchema,
  updateRankingSchema,
} from '@tessera/validation';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, OptionalUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { DiscoveryService } from './discovery.service.js';

@ApiTags('discover')
@Controller('v1')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('feed/discover')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  feed(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(discoverFeedQuerySchema)) query: ReturnType<typeof discoverFeedQuerySchema.parse>,
  ) {
    return this.discovery.discover(user.id, {
      cursor: query.cursor,
      limit: query.limit,
      topic: query.topic?.toLowerCase(),
    });
  }

  @Get('feed/discover/impressions/:id')
  @UseGuards(AuthGuard)
  why(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.discovery.why(user.id, id);
  }

  @Get('me/discover')
  @UseGuards(AuthGuard)
  weights(@CurrentUser() user: RequestUser) {
    return this.discovery.getWeights(user.id);
  }

  @Put('me/discover')
  @UseGuards(AuthGuard)
  setWeights(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateRankingSchema)) body: ReturnType<typeof updateRankingSchema.parse>,
  ) {
    return this.discovery.setWeights(user.id, body);
  }

  @Get('discover/people')
  @UseGuards(AuthGuard)
  suggestions(@CurrentUser() user: RequestUser) {
    return this.discovery.suggestions(user.id);
  }

  @Post('discover/people/:handle/dismiss')
  @UseGuards(AuthGuard)
  dismiss(@CurrentUser() user: RequestUser, @Param('handle') handle: string) {
    return this.discovery.dismissSuggestion(user.id, handle);
  }

  @Get('hashtags/:tag')
  @UseGuards(OptionalAuthGuard)
  hashtag(
    @Param('tag', new ZodPipe(hashtagParamSchema)) tag: string,
    @Query(new ZodPipe(hashtagQuerySchema)) query: ReturnType<typeof hashtagQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.discovery.hashtagPage(viewer?.id, tag, query);
  }

  @Post('hashtags/:tag/follow')
  @UseGuards(AuthGuard)
  followHashtag(
    @CurrentUser() user: RequestUser,
    @Param('tag', new ZodPipe(hashtagParamSchema)) tag: string,
  ) {
    return this.discovery.followHashtag(user.id, tag);
  }

  @Delete('hashtags/:tag/follow')
  @UseGuards(AuthGuard)
  unfollowHashtag(
    @CurrentUser() user: RequestUser,
    @Param('tag', new ZodPipe(hashtagParamSchema)) tag: string,
  ) {
    return this.discovery.unfollowHashtag(user.id, tag);
  }

  @Get('me/hashtags')
  @UseGuards(AuthGuard)
  myHashtags(@CurrentUser() user: RequestUser) {
    return this.discovery.myHashtags(user.id);
  }

  @Get('places/:slug')
  @UseGuards(OptionalAuthGuard)
  place(
    @Param('slug') slug: string,
    @Query(new ZodPipe(placeQuerySchema)) query: ReturnType<typeof placeQuerySchema.parse>,
    @OptionalUser() viewer?: RequestUser,
  ) {
    return this.discovery.placePage(viewer?.id, slug.toLowerCase(), query);
  }

  @Get('users/:handle/memory-map')
  @UseGuards(OptionalAuthGuard)
  memoryMap(@Param('handle') handle: string, @OptionalUser() viewer?: RequestUser) {
    return this.discovery.memoryMap(handle, viewer?.id);
  }
}

import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { followingFeedQuerySchema } from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { FeedService } from './feed.service.js';

@ApiTags('feed')
@ApiCookieAuth()
@Controller('v1/feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('following')
  following(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(followingFeedQuerySchema)) query: ReturnType<typeof followingFeedQuerySchema.parse>,
  ) {
    return this.feed.following(user.id, {
      cursor: query.cursor,
      limit: query.limit,
      keepGoing: query.keepGoing,
    });
  }

  @Post('following/caught-up')
  caughtUp(@CurrentUser() user: RequestUser) {
    return this.feed.markCaughtUp(user.id);
  }
}

import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { searchQuerySchema } from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { DiscoveryService } from './discovery.service.js';

@ApiTags('search')
@ApiCookieAuth()
@Controller('v1')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('search')
  search(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(searchQuerySchema)) query: ReturnType<typeof searchQuerySchema.parse>,
  ) {
    return this.discovery.search(user.id, query);
  }

  @Get('search/recent')
  recent(@CurrentUser() user: RequestUser) {
    return this.discovery.recentSearches(user.id);
  }

  @Delete('search/recent')
  clear(@CurrentUser() user: RequestUser) {
    return this.discovery.clearRecentSearches(user.id);
  }

}

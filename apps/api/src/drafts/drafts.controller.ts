import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { createDraftSchema, draftsQuerySchema, updateDraftSchema } from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { DraftsService } from './drafts.service.js';

@ApiTags('drafts')
@ApiCookieAuth()
@Controller('v1')
@UseGuards(AuthGuard)
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get('drafts')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(draftsQuerySchema)) query: ReturnType<typeof draftsQuerySchema.parse>,
  ) {
    return this.drafts.list(user.id, { cursor: query.cursor, limit: query.limit, kind: query.kind });
  }

  @Post('drafts')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createDraftSchema)) body: ReturnType<typeof createDraftSchema.parse>,
  ) {
    return this.drafts.create(user.id, body);
  }

  @Get('drafts/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.drafts.get(user.id, id);
  }

  @Patch('drafts/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateDraftSchema)) body: ReturnType<typeof updateDraftSchema.parse>,
  ) {
    return this.drafts.update(user.id, id, body);
  }

  @Delete('drafts/:id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.drafts.remove(user.id, id);
    return { ok: true };
  }
}

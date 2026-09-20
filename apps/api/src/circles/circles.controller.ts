import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { circleMemberSchema, createCircleSchema, updateCircleSchema } from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { CirclesService } from './circles.service.js';

@ApiTags('circles')
@ApiCookieAuth()
@Controller('v1')
@UseGuards(AuthGuard)
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  @Get('me/circles')
  list(@CurrentUser() user: RequestUser) {
    return this.circles.list(user.id);
  }

  @Post('me/circles')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createCircleSchema)) body: ReturnType<typeof createCircleSchema.parse>,
  ) {
    return this.circles.create(user.id, body);
  }

  @Get('me/circles/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.circles.get(user.id, id);
  }

  @Patch('me/circles/:id')
  rename(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateCircleSchema)) body: ReturnType<typeof updateCircleSchema.parse>,
  ) {
    return this.circles.rename(user.id, id, body);
  }

  @Delete('me/circles/:id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.circles.remove(user.id, id);
    return { ok: true };
  }

  @Post('me/circles/:id/members')
  addMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(circleMemberSchema)) body: ReturnType<typeof circleMemberSchema.parse>,
  ) {
    return this.circles.addMember(user.id, id, body.handle);
  }

  @Delete('me/circles/:id/members/:handle')
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('handle') handle: string,
  ) {
    return this.circles.removeMember(user.id, id, handle);
  }
}

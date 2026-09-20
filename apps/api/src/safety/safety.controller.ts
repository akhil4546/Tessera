import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  createAppealSchema,
  createReportSchema,
  deleteAccountSchema,
  reportBodySchema,
  updateSensitivitySchema,
  wellbeingHeartbeatSchema,
} from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { SafetyService } from './safety.service.js';

@ApiTags('safety')
@ApiCookieAuth()
@Controller('v1')
@UseGuards(AuthGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('reports')
  create(@CurrentUser() user: RequestUser, @Body(new ZodPipe(createReportSchema)) body: ReturnType<typeof createReportSchema.parse>) {
    return this.safety.report(user.id, body);
  }

  @Get('me/reports')
  mine(@CurrentUser() user: RequestUser) {
    return this.safety.myReports(user.id);
  }

  @Post('posts/:id/report')
  reportPost(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'post', targetId: id });
  }

  @Post('loops/:id/report')
  reportLoop(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'loop', targetId: id });
  }

  @Post('comments/:id/report')
  reportComment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'comment', targetId: id });
  }

  @Post('moments/:id/report')
  reportMoment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.report(user.id, { ...body, targetKind: 'moment', targetId: id });
  }

  @Post('users/:handle/report')
  reportAccount(
    @CurrentUser() user: RequestUser,
    @Param('handle') handle: string,
    @Body(new ZodPipe(reportBodySchema)) body: ReturnType<typeof reportBodySchema.parse>,
  ) {
    return this.safety.reportHandle(user.id, handle, body);
  }

  @Post('appeals')
  appeal(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(createAppealSchema)) body: ReturnType<typeof createAppealSchema.parse>,
  ) {
    return this.safety.createAppeal(user.id, body);
  }

  @Get('me/appeals')
  myAppeals(@CurrentUser() user: RequestUser) {
    return this.safety.myAppeals(user.id);
  }

  @Put('me/sensitivity')
  sensitivity(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateSensitivitySchema)) body: ReturnType<typeof updateSensitivitySchema.parse>,
  ) {
    return this.safety.setSensitivity(user.id, body.sensitivityLevel);
  }

  @Post('me/export')
  exportData(@CurrentUser() user: RequestUser) {
    return this.safety.requestExport(user.id);
  }

  @Get('me/export')
  listExports(@CurrentUser() user: RequestUser) {
    return this.safety.listExports(user.id);
  }

  @Get('me/export/:id')
  getExport(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.safety.getExport(user.id, id);
  }

  @Post('me/delete')
  deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(deleteAccountSchema)) body: ReturnType<typeof deleteAccountSchema.parse>,
  ) {
    return this.safety.requestDeletion(user.id, body.password);
  }

  @Delete('me/delete')
  cancelDelete(@CurrentUser() user: RequestUser) {
    return this.safety.cancelDeletion(user.id);
  }

  @Post('me/wellbeing/heartbeat')
  heartbeat(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(wellbeingHeartbeatSchema)) body: ReturnType<typeof wellbeingHeartbeatSchema.parse>,
  ) {
    return this.safety.heartbeat(user.id, body.seconds);
  }

  @Post('me/wellbeing/break')
  dismissBreak(@CurrentUser() user: RequestUser) {
    return this.safety.dismissSessionNudge(user.id);
  }
}

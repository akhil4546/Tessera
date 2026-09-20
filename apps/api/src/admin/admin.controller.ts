import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  adminActionSchema,
  adminAppealResolveSchema,
  adminAuditQuerySchema,
  adminLoginSchema,
  adminQueueQuerySchema,
  adminSuspendSchema,
  adminUserQuerySchema,
  keywordFilterSchema,
} from '@tessera/validation';
import { ZodPipe } from '../common/zod-pipe.js';
import { readAdminRefreshToken } from '../common/cookies.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminGuard, RequireAdminRoleGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { CurrentAdmin, type RequestAdmin } from './current-admin.js';

@ApiTags('admin')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly admin: AdminService,
  ) {}

  @Post('auth/login')
  login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(adminLoginSchema)) body: ReturnType<typeof adminLoginSchema.parse>,
  ) {
    return this.auth.login(body.email, body.password, req, res);
  }

  @Post('auth/logout')
  @UseGuards(AdminGuard)
  logout(
    @CurrentAdmin() admin: RequestAdmin,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.logout(admin.id, admin.sessionId, res);
  }

  @Post('auth/refresh')
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string },
  ) {
    const token = readAdminRefreshToken(req, body.refreshToken);
    if (!token) {
      return this.auth.refresh('', req, res);
    }
    return this.auth.refresh(token, req, res);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: RequestAdmin) {
    return this.auth.me(admin.id);
  }

  @Get('queue')
  @UseGuards(AdminGuard)
  queue(@Query(new ZodPipe(adminQueueQuerySchema)) query: ReturnType<typeof adminQueueQuerySchema.parse>) {
    return this.admin.queue(query);
  }

  @Get('cases/:id')
  @UseGuards(AdminGuard)
  getCase(@Param('id') id: string) {
    return this.admin.getCase(id);
  }

  @Post('cases/:id/claim')
  @UseGuards(AdminGuard)
  claim(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) {
    return this.admin.claim(admin.id, id);
  }

  @Post('cases/:id/action')
  @UseGuards(AdminGuard)
  act(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(new ZodPipe(adminActionSchema)) body: ReturnType<typeof adminActionSchema.parse>,
  ) {
    return this.admin.act(admin.id, id, body.kind, body.note, body.suspendDays);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  users(@Query(new ZodPipe(adminUserQuerySchema)) query: ReturnType<typeof adminUserQuerySchema.parse>) {
    return this.admin.lookupUsers(query.q, query.cursor, query.limit);
  }

  @Get('users/:id')
  @UseGuards(AdminGuard)
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/suspend')
  @UseGuards(AdminGuard, RequireAdminRoleGuard)
  suspend(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(new ZodPipe(adminSuspendSchema)) body: ReturnType<typeof adminSuspendSchema.parse>,
  ) {
    return this.admin.suspend(admin.id, id, body.reason, body.days);
  }

  @Post('users/:id/unsuspend')
  @UseGuards(AdminGuard, RequireAdminRoleGuard)
  unsuspend(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) {
    return this.admin.unsuspend(admin.id, id);
  }

  @Post('posts/:id/takedown')
  @UseGuards(AdminGuard)
  takedownPost(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.admin.takedownPost(admin.id, id, body.note ?? '');
  }

  @Post('posts/:id/restore')
  @UseGuards(AdminGuard)
  restorePost(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) {
    return this.admin.restorePost(admin.id, id);
  }

  @Post('moments/:id/takedown')
  @UseGuards(AdminGuard)
  takedownMoment(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.admin.takedownMoment(admin.id, id, body.note ?? '');
  }

  @Get('appeals')
  @UseGuards(AdminGuard)
  appeals(@Query(new ZodPipe(adminAuditQuerySchema)) query: ReturnType<typeof adminAuditQuerySchema.parse>) {
    return this.admin.listAppeals(query.cursor, query.limit);
  }

  @Post('appeals/:id/resolve')
  @UseGuards(AdminGuard)
  resolveAppeal(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(new ZodPipe(adminAppealResolveSchema)) body: ReturnType<typeof adminAppealResolveSchema.parse>,
  ) {
    return this.admin.resolveAppeal(admin.id, id, body.status, body.decision);
  }

  @Get('audit')
  @UseGuards(AdminGuard)
  audit(@Query(new ZodPipe(adminAuditQuerySchema)) query: ReturnType<typeof adminAuditQuerySchema.parse>) {
    return this.admin.listAudit(query.cursor, query.limit);
  }

  @Get('keyword-filters')
  @UseGuards(AdminGuard)
  keywords() {
    return this.admin.listKeywords();
  }

  @Post('keyword-filters')
  @UseGuards(AdminGuard, RequireAdminRoleGuard)
  addKeyword(
    @CurrentAdmin() admin: RequestAdmin,
    @Body(new ZodPipe(keywordFilterSchema)) body: ReturnType<typeof keywordFilterSchema.parse>,
  ): Promise<import('@tessera/types').KeywordFilterView> {
    return this.admin.addKeyword(admin.id, body.keyword, body.action);
  }

  @Delete('keyword-filters/:id')
  @UseGuards(AdminGuard, RequireAdminRoleGuard)
  removeKeyword(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) {
    return this.admin.removeKeyword(admin.id, id);
  }
}

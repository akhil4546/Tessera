import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  activityQuerySchema,
  markNotificationsReadSchema,
  registerDeviceSchema,
  updateNotificationPreferencesSchema,
} from '@tessera/validation';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('v1')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(activityQuerySchema)) query: ReturnType<typeof activityQuerySchema.parse>,
  ) {
    return this.notifications.listActivity(user.id, query.filter, query.cursor, query.limit);
  }

  @Post('notifications/read')
  read(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(markNotificationsReadSchema)) body: ReturnType<typeof markNotificationsReadSchema.parse>,
  ) {
    return this.notifications.markRead(user.id, body);
  }

  @Get('me/notification-preferences')
  prefs(@CurrentUser() user: RequestUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Put('me/notification-preferences')
  setPrefs(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(updateNotificationPreferencesSchema))
    body: ReturnType<typeof updateNotificationPreferencesSchema.parse>,
  ) {
    return this.notifications.setPreferences(user.id, body);
  }

  @Get('me/devices')
  devices(@CurrentUser() user: RequestUser) {
    return this.notifications.listDevices(user.id);
  }

  @Post('me/devices')
  register(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(registerDeviceSchema)) body: ReturnType<typeof registerDeviceSchema.parse>,
  ) {
    return this.notifications.registerDevice(user.id, body);
  }

  @Delete('me/devices/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notifications.removeDevice(user.id, id);
  }

  @Get('me/push/vapid')
  vapid() {
    return this.notifications.vapidPublic();
  }
}

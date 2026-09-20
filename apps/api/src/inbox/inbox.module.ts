import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { InboxController } from './inbox.controller.js';
import { InboxGateway } from './inbox.gateway.js';
import { InboxRealtime } from './inbox.realtime.js';
import { InboxService } from './inbox.service.js';

@Module({
  imports: [UsersModule, MediaModule, NotificationsModule, SafetyModule],
  controllers: [InboxController],
  providers: [InboxService, InboxRealtime, InboxGateway],
  exports: [InboxService, InboxRealtime],
})
export class InboxModule {}

import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { MomentsController } from './moments.controller.js';
import { MomentsService } from './moments.service.js';

@Module({
  imports: [UsersModule, MediaModule, InboxModule, NotificationsModule],
  controllers: [MomentsController],
  providers: [MomentsService],
  exports: [MomentsService],
})
export class MomentsModule {}

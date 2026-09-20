import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UsersModule } from '../users/users.module.js';
import { GraphController } from './graph.controller.js';
import { GraphService } from './graph.service.js';

@Module({
  imports: [UsersModule, PostsModule, InboxModule, NotificationsModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}

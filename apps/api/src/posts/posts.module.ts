import { Module } from '@nestjs/common';
import { SearchModule } from '../discovery/search.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { CommentsService } from './comments.service.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [UsersModule, MediaModule, SearchModule, NotificationsModule, SafetyModule],
  controllers: [PostsController, FeedController],
  providers: [PostsService, CommentsService, FeedService],
  exports: [PostsService, FeedService],
})
export class PostsModule {}

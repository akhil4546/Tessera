import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UsersModule } from '../users/users.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
import { SearchController } from './search.controller.js';
import { SearchModule } from './search.module.js';

@Module({
  imports: [UsersModule, PostsModule, SearchModule, BoardsModule],
  controllers: [DiscoveryController, SearchController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}

import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UsersModule } from '../users/users.module.js';
import { LoopsController } from './loops.controller.js';
import { LoopsService } from './loops.service.js';

@Module({
  imports: [UsersModule, MediaModule, PostsModule],
  controllers: [LoopsController],
  providers: [LoopsService],
  exports: [LoopsService],
})
export class LoopsModule {}

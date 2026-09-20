import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { CirclesController } from './circles.controller.js';
import { CirclesService } from './circles.service.js';

@Module({
  imports: [UsersModule],
  controllers: [CirclesController],
  providers: [CirclesService],
  exports: [CirclesService],
})
export class CirclesModule {}

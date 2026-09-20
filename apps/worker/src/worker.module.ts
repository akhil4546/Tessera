import { Module } from '@nestjs/common';
import { RedisProbe } from './redis.probe.js';

@Module({
  providers: [RedisProbe],
})
export class WorkerModule {}

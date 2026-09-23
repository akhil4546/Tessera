import 'reflect-metadata';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '.env') });
loadEnv({ path: path.resolve(process.cwd(), '../../.env') });
loadEnv({ path: path.resolve(process.cwd(), '../api/.env') });

import { NestFactory } from '@nestjs/core';
import { logger } from './logger.js';
import { startWorkers } from './queues.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  logger.info('Tessera worker starting (Phase 7 — media, feed, Moments, Loops, notifications)');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  let workers: { close: () => Promise<void> } | null = null;
  try {
    workers = startWorkers();
  } catch (error) {
    logger.warn(
      { err: error },
      'SOFT-FAIL: could not start BullMQ workers. API will process jobs inline if Redis is down. (not a silent stub)',
    );
  }

  setInterval(() => {
    logger.info(
      workers
        ? 'worker heartbeat — processing media and feed jobs'
        : 'worker heartbeat — idle, no Redis',
    );
  }, 60_000).unref();

  const shutdown = async () => {
    await workers?.close();
    await app.close();
  };
  const onSignal = () => {
    shutdown().catch((error: unknown) => {
      logger.error({ err: error }, 'Worker shutdown failed');
      process.exit(1);
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});

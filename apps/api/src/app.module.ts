import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { IdempotencyService } from './common/idempotency.js';
import { AuthCoreModule } from './auth/auth-core.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GraphModule } from './graph/graph.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { MediaModule } from './media/media.module.js';
import { DiscoveryModule } from './discovery/discovery.module.js';
import { InboxModule } from './inbox/inbox.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { LoopsModule } from './loops/loops.module.js';
import { MomentsModule } from './moments/moments.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';
import { CirclesModule } from './circles/circles.module.js';
import { BoardsModule } from './boards/boards.module.js';
import { DraftsModule } from './drafts/drafts.module.js';
import { SafetyModule } from './safety/safety.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
        transport:
          process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
      },
    }),
    PrismaModule,
    StorageModule,
    QueueModule,
    MailModule,
    AuthCoreModule,
    HealthModule,
    UsersModule,
    AuthModule,
    GraphModule,
    MediaModule,
    PostsModule,
    MomentsModule,
    LoopsModule,
    DiscoveryModule,
    InboxModule,
    NotificationsModule,
    CirclesModule,
    BoardsModule,
    DraftsModule,
    SafetyModule,
    AdminModule,
  ],
  providers: [IdempotencyService, { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}

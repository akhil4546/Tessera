import 'reflect-metadata';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

loadEnv({ path: path.resolve(process.cwd(), '.env') });
loadEnv({ path: path.resolve(process.cwd(), '../../.env') });
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, raw } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './common/http-filter.js';
import { RedisIoAdapter } from './inbox/redis-io.adapter.js';
import { CSRF_EXEMPT_PATHS, allowedOrigins, isAllowedOrigin } from './common/origins.js';
import { ACCESS_COOKIE, ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, REFRESH_COOKIE } from './common/cookies.js';
import { initObservability } from './observability.js';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  initObservability();

  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new HttpErrorFilter());
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '2mb' }));
  app.use('/v1/media', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && req.path.endsWith('/bytes')) {
      raw({ type: '*/*', limit: '110mb' })(req, res, next);
      return;
    }
    next();
  });

  const origins = allowedOrigins();
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (CSRF_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const hasCookie = Boolean(
      req.cookies?.[ACCESS_COOKIE] ||
        req.cookies?.[REFRESH_COOKIE] ||
        req.cookies?.[ADMIN_ACCESS_COOKIE] ||
        req.cookies?.[ADMIN_REFRESH_COOKIE],
    );
    const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
    if (hasCookie && !bearer && !isAllowedOrigin(req.headers.origin)) {
      res.status(403).json({ error: { code: 'CSRF', message: 'Origin is not allowed.' } });
      return;
    }
    next();
  });

  const swagger = new DocumentBuilder()
    .setTitle('Tessera API')
    .setDescription(
      'Phase 9: identity through organisation, plus reporting, moderation, and a separate admin session. Cookie session on web; bearer + refresh token JSON on mobile. Admin uses tessera_admin_* cookies. This is not an Instagram clone.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(ACCESS_COOKIE)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  const redisIo = new RedisIoAdapter(app);
  await redisIo.connectToRedis();
  app.useWebSocketAdapter(redisIo);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

bootstrap();

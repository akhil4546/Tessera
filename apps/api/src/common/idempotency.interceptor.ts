import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { catchError, from, mergeMap, of, throwError, type Observable } from 'rxjs';
import { TesseraHttpError } from './http-error.js';
import {
  hashIdempotencyBody,
  IdempotencyService,
  idempotencyRoute,
  readIdempotencyKey,
} from './idempotency.js';

type AuthedRequest = Request & { user?: { id?: string } };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly log = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const key = readIdempotencyKey(req.header('idempotency-key') ?? req.headers['idempotency-key']);
    if (key === null) return next.handle();
    if (key === 'invalid') {
      return throwError(
        () =>
          new TesseraHttpError(
            400,
            'VALIDATION',
            'Idempotency-Key must be a single line of at most 255 characters.',
          ),
      );
    }

    const userId = req.user?.id;
    if (!userId) return next.handle();

    const route = idempotencyRoute(method, req.path || req.originalUrl || req.url, req.query);
    const hash = hashIdempotencyBody(req.body);

    return from(this.idempotency.begin(userId, key, route, hash)).pipe(
      mergeMap((begun) => {
        if (begun.kind === 'replay') return of(begun.body);
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            try {
              await this.idempotency.complete(
                userId,
                key,
                route,
                statusFor(context, this.reflector),
                body,
                hash,
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : 'error';
              this.log.warn(
                `SOFT-FAIL: could not store idempotency result (${message}). The response was still returned.`,
              );
            }
            return body;
          }),
          catchError((error: unknown) =>
            from(
              this.idempotency.abort(userId, key, route, hash).catch((abortError: unknown) => {
                const message = abortError instanceof Error ? abortError.message : 'error';
                this.log.warn(`SOFT-FAIL: could not release idempotency key (${message}).`);
              }),
            ).pipe(mergeMap(() => throwError(() => error))),
          ),
        );
      }),
    );
  }
}

function statusFor(context: ExecutionContext, reflector: Reflector): number {
  const explicit = reflector.get<number | undefined>('__httpCode__', context.getHandler());
  if (typeof explicit === 'number') return explicit;
  const method = context.switchToHttp().getRequest<{ method: string }>().method.toUpperCase();
  return method === 'POST' ? 201 : 200;
}

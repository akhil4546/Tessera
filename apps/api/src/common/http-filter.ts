import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { TesseraHttpError } from './http-error.js';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly log = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof TesseraHttpError) {
      if (exception.headers) {
        for (const [name, value] of Object.entries(exception.headers)) {
          res.setHeader(name, value);
        }
      }
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : typeof raw === 'object' && raw && 'message' in raw
            ? Array.isArray(raw.message)
              ? String((raw as { message: string[] }).message[0])
              : String(raw.message)
            : exception.message;
      res.status(status).json({
        error: {
          code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'HTTP',
          message,
        },
      });
      return;
    }
    const message = exception instanceof Error ? exception.message : 'unknown';
    this.log.error(message, exception instanceof Error ? exception.stack : undefined);
    if (/can't reach database|connection refused|ECONNREFUSED|P1001/i.test(message)) {
      res.status(503).json({
        error: { code: 'DATABASE', message: 'Database is unavailable.' },
      });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  }
}

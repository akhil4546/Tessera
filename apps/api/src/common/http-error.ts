import { HttpException } from '@nestjs/common';

export class TesseraHttpError extends HttpException {
  readonly code: string;
  readonly headers?: Readonly<Record<string, string>>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>,
  ) {
    super({ error: { code, message } }, status);
    this.code = code;
    this.headers = headers;
  }
}

export function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Invalid request';
}

import { HttpException } from '@nestjs/common';

export class TesseraHttpError extends HttpException {
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } }, status);
    this.code = code;
  }
}

export function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Invalid request';
}

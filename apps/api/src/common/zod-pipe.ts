import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { TesseraHttpError, firstZodMessage } from './http-error.js';

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new TesseraHttpError(400, 'VALIDATION', firstZodMessage(result.error));
    }
    return result.data;
  }
}

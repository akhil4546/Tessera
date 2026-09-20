import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@tessera/validation';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'tessera-api',
      phase: 7,
    };
  }
}

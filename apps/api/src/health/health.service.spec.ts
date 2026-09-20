import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('returns ok for Phase 7', () => {
    expect(new HealthService().getHealth()).toEqual({
      status: 'ok',
      service: 'tessera-api',
      phase: 7,
    });
  });
});

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get(['health', 'v1/health'])
  @ApiOperation({ summary: 'Liveness/readiness for the API process' })
  @ApiOkResponse({ description: 'API is up' })
  get() {
    return this.health.getHealth();
  }
}

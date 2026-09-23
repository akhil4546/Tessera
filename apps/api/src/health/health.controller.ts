import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get(['health', 'v1/health'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Liveness. Does not check dependencies.' })
  @ApiOkResponse({ description: 'The API process can answer HTTP' })
  get() {
    return this.health.getHealth();
  }

  @Get(['health/ready', 'v1/health/ready'])
  @ApiOperation({
    summary: 'Readiness of Postgres, Redis, object storage, and Meilisearch',
  })
  @ApiOkResponse({ description: 'Ready, or degraded when Redis or search is unset or unreachable' })
  @ApiResponse({ status: 503, description: 'Postgres or object storage is down' })
  async ready(@Res() res: Response): Promise<void> {
    const body = await this.health.getReadiness();
    res.setHeader('Cache-Control', 'no-store');
    res.status(body.status === 'down' ? 503 : 200).json(body);
  }
}

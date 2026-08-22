import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService, LivenessResult, ReadinessResult } from './health.service';

/**
 * Public, unauthenticated health surface. It is the contract both clients use
 * to confirm they are pointed at a reachable Shoprex backend.
 *
 *   GET /api/v1/health       -> liveness
 *   GET /api/v1/health/live  -> liveness
 *   GET /api/v1/health/ready -> liveness + PostgreSQL round trip
 */
@SkipThrottle({ auth: true })
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  getHealth(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessResult> {
    const result = await this.healthService.getReadiness();

    // 503 when the database is unreachable, so orchestrators and the clients
    // can distinguish "process alive" from "actually usable".
    res.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return result;
  }
}
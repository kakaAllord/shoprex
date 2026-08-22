import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService, LivenessResult, ReadinessResult } from './health.service';
import { LivenessResponseDto, ReadinessResponseDto } from './dto/health-response.dto';

/**
 * Public, unauthenticated health surface. It is the contract both clients use
 * to confirm they are pointed at a reachable Shoprex backend.
 *
 *   GET /api/v1/health       -> liveness
 *   GET /api/v1/health/live  -> liveness
 *   GET /api/v1/health/ready -> liveness + PostgreSQL round trip
 */
@ApiTags('health')
@SkipThrottle({ auth: true })
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'Liveness',
    description: 'Answers as long as the process is running. Does not touch the database.',
  })
  @ApiOkResponse({ type: LivenessResponseDto })
  @Get()
  @HttpCode(HttpStatus.OK)
  getHealth(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @ApiOperation({ summary: 'Liveness (explicit path)' })
  @ApiOkResponse({ type: LivenessResponseDto })
  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @ApiOperation({
    summary: 'Readiness',
    description:
      'Liveness plus a real PostgreSQL round trip. Answers 503 when the database is unreachable — the body is still a valid readiness payload, which is how a client tells "reachable but unhealthy" from "not reachable at all".',
  })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({
    type: ReadinessResponseDto,
    description: 'The API is up but PostgreSQL is unreachable.',
  })
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

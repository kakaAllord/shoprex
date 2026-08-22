import { ApiProperty } from '@nestjs/swagger';
import type { HealthStatus, LivenessResult, ReadinessResult } from '../health.service';

/** `implements` keeps the published schema honest if the service shape moves. */
export class LivenessResponseDto implements LivenessResult {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'shoprex-backend' })
  service!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 'development' })
  environment!: string;

  @ApiProperty({ example: 'Africa/Dar_es_Salaam' })
  timezone!: string;

  @ApiProperty({ example: 128.4, description: 'Seconds since this process started.' })
  uptimeSeconds!: number;

  @ApiProperty({
    example: '2026-08-22T18:52:23.241Z',
    format: 'date-time',
    description: 'Server clock. Clients must never substitute their own.',
  })
  timestamp!: string;
}

class DatabaseHealthDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 3, nullable: true, type: Number })
  latencyMs!: number | null;

  @ApiProperty({ required: false, example: 'connection refused' })
  message?: string;
}

export class ReadinessResponseDto extends LivenessResponseDto implements ReadinessResult {
  @ApiProperty({
    type: DatabaseHealthDto,
    description: 'Result of a real PostgreSQL round trip.',
  })
  database!: { status: HealthStatus; latencyMs: number | null; message?: string };
}

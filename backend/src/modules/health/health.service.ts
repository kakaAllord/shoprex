import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export type HealthStatus = 'ok' | 'error';

export interface LivenessResult {
  status: HealthStatus;
  service: string;
  version: string;
  environment: string;
  timezone: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResult extends LivenessResult {
  database: {
    status: HealthStatus;
    latencyMs: number | null;
    message?: string;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Liveness: the process is up. Does not touch the database. */
  getLiveness(): LivenessResult {
    return {
      status: 'ok',
      service: 'shoprex-backend',
      version: process.env.npm_package_version ?? '0.1.0',
      environment: this.config.get<string>('app.nodeEnv', 'development'),
      timezone: this.config.get<string>('app.defaultTimezone', 'Africa/Dar_es_Salaam'),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: the process is up AND PostgreSQL answers. */
  async getReadiness(): Promise<ReadinessResult> {
    const base = this.getLiveness();
    const startedAt = Date.now();

    try {
      await this.prisma.ping();

      return {
        ...base,
        database: { status: 'ok', latencyMs: Date.now() - startedAt },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Readiness check failed: ${message}`);

      return {
        ...base,
        status: 'error',
        database: { status: 'error', latencyMs: null, message },
      };
    }
  }
}

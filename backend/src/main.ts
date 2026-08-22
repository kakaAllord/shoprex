import 'reflect-metadata';
import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Everything at or above the configured level is logged. */
const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

function resolveLogLevels(configured: string): LogLevel[] {
  const index = LOG_LEVELS.indexOf(configured as LogLevel);

  return index === -1 ? LOG_LEVELS.slice(0, 3) : LOG_LEVELS.slice(0, index + 1);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const port = config.get<number>('app.port', 3001);
  const apiPrefix = config.get<string>('app.apiPrefix', 'api/v1');
  // Validated at boot, so this is always populated from the environment.
  const corsOrigins = config.get<string[]>('app.corsOrigins', []);

  app.useLogger(resolveLogLevels(config.get<string>('app.logLevel', 'debug')));

  app.setGlobalPrefix(apiPrefix);

  // Reject unknown fields outright: clients must send exactly what the DTO
  // declares, which keeps tenant/branch spoofing attempts from sliding through.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Browser clients only. The Flutter app is not subject to CORS.
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`Shoprex backend listening on port ${port} under /${apiPrefix}`);
  logger.log(`Readiness: GET /${apiPrefix}/health/ready`);
}

void bootstrap();

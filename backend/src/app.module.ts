import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { appConfiguration } from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Shoprex V1 root module.
 *
 * Feature modules (auth, businesses, branches, users, devices, products,
 * stock, sales, payments, reports) are added from Phase 1 onward. Keep every
 * business rule inside a module or the domain layer, never in a controller.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfiguration],
      validate: validateEnvironment,
      envFilePath: ['.env'],
    }),
    // Two buckets: a broad default for the whole API, and a tight one the
    // auth routes opt into with @Throttle({ auth: ... }).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = config.get<number>('app.rateLimitTtlMs', 60_000);

        return [
          { name: 'default', ttl, limit: config.get<number>('app.rateLimitDefault', 120) },
          { name: 'auth', ttl, limit: config.get<number>('app.rateLimitAuth', 10) },
        ];
      },
    }),
    PrismaModule,
    AuthModule,
    BusinessesModule,
    BranchesModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle before authenticating, so a flood of bad
    // credentials is rejected cheaply.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route is authenticated unless marked @Public(), and role checks
    // run on the server for every request.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

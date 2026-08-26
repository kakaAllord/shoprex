import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BusinessActiveGuard } from './common/guards/business-active.guard';
import { DeviceSessionGuard } from './common/guards/device-session.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { DevicesModule } from './modules/devices/devices.module';
import { PaymentMethodsModule } from './modules/payments/payment-methods.module';
import { ProductsModule } from './modules/products/products.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SalesModule } from './modules/sales/sales.module';
import { StockModule } from './modules/stock/stock.module';
import { UsersModule } from './modules/users/users.module';
import { appConfiguration } from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Shoprex V1 root module.
 *
 * Feature modules (auth, businesses, branches, users, devices, audit,
 * products, stock, sales, payments, reports) are added from Phase 1 onward.
 * Keep every business rule inside a module or the domain layer, never in a
 * controller — the package and stock arithmetic lives in src/domain and is
 * tested without a database or an HTTP request in sight.
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
    AuditModule,
    AuthModule,
    BusinessesModule,
    BranchesModule,
    UsersModule,
    DevicesModule,
    ProductsModule,
    StockModule,
    PaymentMethodsModule,
    SalesModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle before authenticating, so a flood of bad
    // credentials is rejected cheaply.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route is authenticated unless marked @Public(), and role checks
    // run on the server for every request.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // First thing after identity: a suspended shop is turned away before any
    // of its people's roles or devices are even considered.
    { provide: APP_GUARD, useClass: BusinessActiveGuard },
    // Then the handset: a revoked device must be turned away before any role
    // check gets the chance to let it through.
    { provide: APP_GUARD, useClass: DeviceSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Last: role decides whether you may reach the route at all, permission
    // decides whether you may do this particular thing once you have.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

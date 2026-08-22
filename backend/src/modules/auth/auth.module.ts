import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';

/** The library types expiresIn as a template literal, so config strings are cast. */
type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret'),
        signOptions: {
          expiresIn: config.get<string>('app.jwtExpiresIn', '8h') as ExpiresIn,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

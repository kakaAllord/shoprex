import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * AuthModule is not imported: the only thing borrowed from it is
 * `AuthService.hashPassword`, a static, so passwords are hashed exactly one
 * way across the whole API without wiring a dependency.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

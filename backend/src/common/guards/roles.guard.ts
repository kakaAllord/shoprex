import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Enforces @Roles(...) after JwtAuthGuard has resolved the principal. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Your role does not permit this action');
    }

    return true;
  }
}

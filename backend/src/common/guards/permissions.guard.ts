import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserPermission, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Enforces @RequirePermissions(...) on the server.
 *
 * Permissions are read from the database on each guarded request rather than
 * carried in the token. That costs a lookup, and it buys the thing Phase 2
 * already chose for device revocation: an owner taking a permission away means
 * it is gone now, not whenever an eight-hour token happens to expire. A worker
 * who has just had SELL removed should not keep selling until lunchtime.
 *
 * Only guarded routes pay the cost — an un-annotated route returns before any
 * query is made.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Your role does not permit this action');
    }

    // The owner grants these permissions; requiring them to grant themselves
    // one would be a loop with no purpose.
    if (user.role === UserRole.OWNER) {
      return true;
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { permissions: true, isActive: true },
    });

    if (!record?.isActive) {
      throw new ForbiddenException('Your role does not permit this action');
    }

    if (!required.some((permission) => record.permissions.includes(permission))) {
      throw new ForbiddenException(
        `Huna ruhusa ya kufanya hili · You do not have permission for this (needs ${required.join(' or ')})`,
      );
    }

    return true;
  }
}

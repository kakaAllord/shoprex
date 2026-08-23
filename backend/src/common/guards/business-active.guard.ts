import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Stops a suspended shop at the backend.
 *
 * A platform administrator suspending a shop account expects it to stop
 * working now, not in eight hours when the tokens its people are already
 * holding happen to expire. That is the same rule device revocation chose in
 * Phase 2, and for the same reason: an account that is suspended everywhere
 * except in the sessions already open is not suspended.
 *
 * Sign-in already refuses a suspended shop — `AuthService.login`,
 * `loginDevice`, `deviceSignInOptions`, and `DevicesService.redeemEnrollment`
 * all check it. This guard closes the one remaining gap, which is the token
 * that was issued before the suspension.
 *
 * The cost is one primary-key lookup per authenticated request that carries a
 * tenant. Platform administrators carry no `businessId` and skip it entirely,
 * as does every `@Public()` route, which never reaches a guard with a user on
 * it. See PROGRESS.md §6 for the note on this being a hot-path cost.
 */
@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;

    if (!user?.businessId) {
      return true;
    }

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { isActive: true },
    });

    // A deleted tenant and a suspended one are one answer: this session is
    // over. Deliberately 403 rather than 401 — the credentials are perfectly
    // good, and telling somebody to sign in again would send them round a loop
    // that ends in the same place.
    if (!business?.isActive) {
      throw new ForbiddenException(
        'Akaunti ya duka hili imesimamishwa · This shop account has been suspended. Contact Shoprex.',
      );
    }

    return true;
  }
}

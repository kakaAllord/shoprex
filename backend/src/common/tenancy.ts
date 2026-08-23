import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

/**
 * The tenant of the caller, taken from the verified token and nowhere else.
 *
 * Platform administrators deliberately have no business of their own: they sit
 * above any single tenant and act on one through the platform endpoints, so
 * asking for "their" business is a programming mistake rather than a
 * permission the caller could be granted.
 */
export function requireBusiness(principal: AuthenticatedUser): string {
  if (!principal.businessId) {
    throw new ForbiddenException(
      'Platform administrators act on a business through the platform endpoints, not this one',
    );
  }

  return principal.businessId;
}

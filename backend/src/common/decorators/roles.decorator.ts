import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'shoprex:roles';

/**
 * Restricts a route to the given roles. Authorization is always decided here,
 * on the server — never by hiding a button in a client.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

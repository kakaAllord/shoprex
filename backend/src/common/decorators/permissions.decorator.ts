import { SetMetadata } from '@nestjs/common';
import { UserPermission } from '@prisma/client';

export const PERMISSIONS_KEY = 'shoprex:permissions';

/**
 * Requires the caller to hold **at least one** of the listed permissions.
 *
 * Any-of rather than all-of, because the real questions are shaped that way:
 * a product may be created by someone who sells *or* by someone who receives
 * stock, and demanding both would stop a cashier adding an unknown item
 * mid-sale — the exact flow doc 01 §5 is built around.
 *
 * Owners are not checked: within their own business the owner is the authority
 * that grants these permissions in the first place.
 */
export const RequirePermissions = (...permissions: UserPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

import { NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { requireBusiness } from './tenancy';

/**
 * "Which branch may this caller act on?" — asked once, in one place.
 *
 * Two rules are folded together here, and both matter:
 *
 * - A branch in **another tenant** answers `404`, never `403`, so a caller
 *   cannot discover that a branch id exists in someone else's business.
 * - A branch inside the caller's **own** business that a manager or worker is
 *   not assigned to answers `404` too. Owners reach every branch of their
 *   business implicitly; nobody else does.
 *
 * Stock asked this question in Phase 3 and sales ask it in Phase 4. It lives
 * here rather than in either module so the two cannot drift apart — a
 * divergence between "who may receive stock into a branch" and "who may sell
 * from it" would be a security bug that reads like a refactor.
 */
export async function requireBranchAccess(
  prisma: Pick<Prisma.TransactionClient, 'branch'>,
  principal: AuthenticatedUser,
  branchId: string,
): Promise<{ id: string; businessId: string; name: string }> {
  const businessId = requireBusiness(principal);

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId,
      ...(principal.role === UserRole.OWNER
        ? {}
        : { assignments: { some: { userId: principal.userId } } }),
    },
    select: { id: true, businessId: true, name: true },
  });

  if (!branch) {
    throw new NotFoundException('Branch not found');
  }

  return branch;
}

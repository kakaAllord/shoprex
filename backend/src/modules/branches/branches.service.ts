import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { requireBusiness } from '../../common/tenancy';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../users/users.service';
import { CreateBranchDto } from './dto/create-branch.dto';

export interface BranchView {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Adds a branch to the caller's own business.
   *
   * The creation is audited, which it was not before Phase 8's audit review:
   * `AuditAction.BRANCH_CREATED` had been declared in the schema since Phase 1
   * and no code ever wrote one. Opening a second shopfront is exactly the kind
   * of thing an owner later asks "who did that, and when" about — and a
   * declared action nobody records is worse than no action at all, because the
   * empty log reads as proof that nothing happened.
   *
   * Both writes share one transaction, the same rule the rest of the codebase
   * follows: an audit line for a branch that was never created would be worse
   * than no line.
   */
  async create(principal: AuthenticatedUser, dto: CreateBranchDto): Promise<BranchView> {
    const businessId = requireBusiness(principal);
    const name = dto.name.trim();

    const existing = await this.prisma.branch.findFirst({ where: { businessId, name } });

    if (existing) {
      throw new ConflictException('A branch with that name already exists');
    }

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: { businessId, name } });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: branch.id,
          action: AuditAction.BRANCH_CREATED,
          targetType: 'Branch',
          targetId: branch.id,
          summary: `Tawi "${branch.name}" limefunguliwa · Branch "${branch.name}" created`,
        },
        tx,
      );

      return branch;
    });
  }

  /**
   * Owners see every branch of their own business. Managers and workers see
   * only the branches they are assigned to.
   */
  async listForPrincipal(principal: AuthenticatedUser): Promise<BranchView[]> {
    const businessId = requireBusiness(principal);

    if (principal.role === UserRole.OWNER) {
      return this.prisma.branch.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { businessId, assignments: { some: { userId: principal.userId } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Cross-tenant reads answer 404, not 403: a caller must not learn that a
   * branch id exists in someone else's business.
   */
  async findOne(principal: AuthenticatedUser, branchId: string): Promise<BranchView> {
    const businessId = requireBusiness(principal);
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, businessId } });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (principal.role !== UserRole.OWNER) {
      const assigned = await this.prisma.branchAssignment.findFirst({
        where: { branchId, userId: principal.userId },
      });

      if (!assigned) {
        throw new NotFoundException('Branch not found');
      }
    }

    return branch;
  }
}

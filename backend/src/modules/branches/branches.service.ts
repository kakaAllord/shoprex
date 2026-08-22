import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(principal: AuthenticatedUser, dto: CreateBranchDto): Promise<BranchView> {
    const businessId = this.requireBusiness(principal);
    const name = dto.name.trim();

    const existing = await this.prisma.branch.findFirst({ where: { businessId, name } });

    if (existing) {
      throw new ConflictException('A branch with that name already exists');
    }

    return this.prisma.branch.create({ data: { businessId, name } });
  }

  /**
   * Owners see every branch of their own business. Managers and workers see
   * only the branches they are assigned to.
   */
  async listForPrincipal(principal: AuthenticatedUser): Promise<BranchView[]> {
    const businessId = this.requireBusiness(principal);

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
    const businessId = this.requireBusiness(principal);
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

  private requireBusiness(principal: AuthenticatedUser): string {
    if (!principal.businessId) {
      throw new ForbiddenException(
        'Platform administrators act on a business through the platform endpoints, not this one',
      );
    }

    return principal.businessId;
  }
}

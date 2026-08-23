import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { createDefaultPaymentMethods } from '../payments/payment-methods.defaults';
import { CreateBusinessDto } from './dto/create-business.dto';

export interface BusinessSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  branchCount: number;
  userCount: number;
}

export interface BusinessDetail extends BusinessSummary {
  branches: { id: string; name: string; isActive: boolean }[];
}

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Platform administrator action: create the tenant and its first owner. */
  async createWithOwner(dto: CreateBusinessDto): Promise<BusinessDetail> {
    const email = dto.ownerEmail.trim().toLowerCase();

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('That email address is already registered');
    }

    const passwordHash = await AuthService.hashPassword(dto.ownerPassword);
    const timezone =
      dto.timezone ?? this.config.get<string>('app.defaultTimezone', 'Africa/Dar_es_Salaam');

    const business = await this.prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: { name: dto.name.trim(), timezone },
      });

      await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.ownerFullName.trim(),
          role: UserRole.OWNER,
          businessId: created.id,
        },
      });

      // In the same transaction, so a shop is never left existing but unable
      // to take money.
      await createDefaultPaymentMethods(tx, created.id);

      return created;
    });

    return this.detail(business.id);
  }

  async listAll(): Promise<BusinessSummary[]> {
    const businesses = await this.prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { branches: true, users: true } } },
    });

    return businesses.map((business) => ({
      id: business.id,
      name: business.name,
      timezone: business.timezone,
      currency: business.currency,
      isActive: business.isActive,
      createdAt: business.createdAt,
      branchCount: business._count.branches,
      userCount: business._count.users,
    }));
  }

  /**
   * Suspends or restores a shop account. Platform administrators only.
   *
   * Nothing is deleted and nothing cascades: the products, stock, sales, and
   * history stay exactly as they are, and restoring the account brings the
   * shop back whole. Suspension is a door being locked, not a demolition —
   * which is what makes it a safe thing for a platform administrator to do.
   *
   * It takes effect immediately in both directions. Sign-in already refuses a
   * suspended shop, and `BusinessActiveGuard` refuses the tokens that were
   * already issued before it happened.
   *
   * No audit row is written. `AuditEvent` is the *owner's* attribution log for
   * their own business, and in V1 nothing reads it on a platform
   * administrator's behalf — the owner of a suspended shop cannot even sign in
   * to look. An audit row nobody can read is scaffolding, so this is a server
   * log line instead, and the decision is recorded in PROGRESS.md §6.
   */
  async setActive(businessId: string, isActive: boolean): Promise<BusinessDetail> {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Business not found');
    }

    if (existing.isActive === isActive) {
      throw new ConflictException(
        isActive
          ? 'That shop account is already active'
          : 'That shop account is already suspended',
      );
    }

    await this.prisma.business.update({ where: { id: businessId }, data: { isActive } });

    this.logger.warn(
      `Business ${isActive ? 'restored' : 'suspended'}: ${existing.name} (${businessId})`,
    );

    return this.detail(businessId);
  }

  /**
   * The tenant of the authenticated principal. The business id comes from the
   * verified token, never from the request, so one owner cannot read another
   * owner's shop by changing a parameter.
   */
  async forPrincipal(principal: AuthenticatedUser): Promise<BusinessDetail> {
    if (!principal.businessId) {
      throw new NotFoundException('This account is not attached to a business');
    }

    return this.detail(principal.businessId);
  }

  private async detail(businessId: string): Promise<BusinessDetail> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        branches: { orderBy: { name: 'asc' } },
        _count: { select: { branches: true, users: true } },
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return {
      id: business.id,
      name: business.name,
      timezone: business.timezone,
      currency: business.currency,
      isActive: business.isActive,
      createdAt: business.createdAt,
      branchCount: business._count.branches,
      userCount: business._count.users,
      branches: business.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        isActive: branch.isActive,
      })),
    };
  }
}

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, UserPermission, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import { normalizeTanzanianPhone } from '../../domain/phone';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

export interface StaffMemberView {
  id: string;
  fullName: string;
  /** Null for workers: they sign in on their bound device, not by email. */
  email: string | null;
  phone: string | null;
  role: UserRole;
  permissions: UserPermission[];
  branchIds: string[];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

type StaffRecord = Prisma.UserGetPayload<{
  include: { assignments: { select: { branchId: true } } };
}>;

const STAFF_ROLES: UserRole[] = [UserRole.MANAGER, UserRole.WORKER];

/** Shared by every write here, so attribution is never assembled by hand. */
export function actorFrom(principal: AuthenticatedUser) {
  return {
    userId: principal.userId,
    role: principal.role,
    deviceId: principal.deviceId,
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A delegated manager. Managers work in the web console, so they get the
   * same email-and-password credentials an owner has, scoped to the branches
   * the owner names.
   */
  async createManager(
    principal: AuthenticatedUser,
    dto: CreateManagerDto,
  ): Promise<StaffMemberView> {
    const businessId = requireBusiness(principal);
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? normalizeTanzanianPhone(dto.phone) : null;

    await this.assertCredentialsAreFree(email, phone);

    const branchIds = await this.resolveBranchIds(businessId, dto.branchIds);
    const passwordHash = await AuthService.hashPassword(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const manager = await tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: UserRole.MANAGER,
          businessId,
          permissions: dto.permissions,
          assignments: { create: branchIds.map((branchId) => ({ branchId })) },
        },
        include: { assignments: { select: { branchId: true } } },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: branchIds[0] ?? null,
          action: AuditAction.MANAGER_CREATED,
          targetType: 'User',
          targetId: manager.id,
          summary: `Meneja ${manager.fullName} ameongezwa · Manager ${manager.fullName} created`,
        },
        tx,
      );

      return manager;
    });

    this.logger.log(`Manager created: ${created.id} in business ${businessId}`);

    return toStaffView(created);
  }

  /**
   * A worker. Created with a name and a password and nothing else: workers do
   * not use the web console, and the device enrolled to them is what identifies
   * them, so there is no email address to invent. A worker belongs to exactly
   * one branch — the one their device will be bound to.
   */
  async createWorker(
    principal: AuthenticatedUser,
    dto: CreateWorkerDto,
  ): Promise<StaffMemberView> {
    const businessId = requireBusiness(principal);
    const phone = dto.phone ? normalizeTanzanianPhone(dto.phone) : null;

    await this.assertCredentialsAreFree(null, phone);

    const [branchId] = await this.resolveBranchIds(businessId, [dto.branchId]);
    const passwordHash = await AuthService.hashPassword(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const worker = await tx.user.create({
        data: {
          email: null,
          phone,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: UserRole.WORKER,
          businessId,
          permissions: dto.permissions,
          assignments: { create: [{ branchId }] },
        },
        include: { assignments: { select: { branchId: true } } },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId,
          action: AuditAction.WORKER_CREATED,
          targetType: 'User',
          targetId: worker.id,
          summary: `Mfanyakazi ${worker.fullName} ameongezwa · Worker ${worker.fullName} created`,
        },
        tx,
      );

      return worker;
    });

    this.logger.log(`Worker created: ${created.id} in business ${businessId}`);

    return toStaffView(created);
  }

  /**
   * Owners see every manager and worker in their business. A manager sees only
   * the staff of the branches they are themselves assigned to.
   */
  async listForPrincipal(principal: AuthenticatedUser): Promise<StaffMemberView[]> {
    const businessId = requireBusiness(principal);

    const where: Prisma.UserWhereInput = {
      businessId,
      role: { in: STAFF_ROLES },
      ...(principal.role === UserRole.OWNER
        ? {}
        : {
            assignments: {
              some: { branch: { assignments: { some: { userId: principal.userId } } } },
            },
          }),
    };

    const staff = await this.prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      include: { assignments: { select: { branchId: true } } },
    });

    return staff.map(toStaffView);
  }

  /** A staff member in another tenant answers 404, never 403. */
  async findOne(principal: AuthenticatedUser, userId: string): Promise<StaffMemberView> {
    return toStaffView(await this.requireStaffMember(principal, userId));
  }

  /**
   * Replaces the permission set outright rather than merging, so the owner
   * always sends the state they intend and a stale client cannot silently
   * restore a permission that was taken away.
   */
  async updatePermissions(
    principal: AuthenticatedUser,
    userId: string,
    dto: UpdatePermissionsDto,
  ): Promise<StaffMemberView> {
    const businessId = requireBusiness(principal);
    const existing = await this.requireStaffMember(principal, userId);
    const granted = dto.permissions.length > 0 ? dto.permissions.join(', ') : 'none';

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: existing.id },
        data: { permissions: dto.permissions },
        include: { assignments: { select: { branchId: true } } },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: user.assignments[0]?.branchId ?? null,
          action: AuditAction.PERMISSIONS_CHANGED,
          targetType: 'User',
          targetId: user.id,
          summary: `Ruhusa za ${user.fullName} zimebadilishwa · Permissions for ${user.fullName} set to ${granted}`,
        },
        tx,
      );

      return user;
    });

    return toStaffView(updated);
  }

  /**
   * Loads a manager or worker the caller is allowed to see, applying exactly
   * the same visibility rule as the list. Anything outside it — another
   * tenant, an unassigned branch, the owner's own account — answers 404.
   */
  private async requireStaffMember(
    principal: AuthenticatedUser,
    userId: string,
  ): Promise<StaffRecord> {
    const businessId = requireBusiness(principal);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: { in: STAFF_ROLES } },
      include: { assignments: { select: { branchId: true } } },
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    if (principal.role !== UserRole.OWNER) {
      const shared = await this.prisma.branchAssignment.findFirst({
        where: {
          userId: principal.userId,
          branchId: { in: user.assignments.map((assignment) => assignment.branchId) },
        },
      });

      if (!shared) {
        throw new NotFoundException('Staff member not found');
      }
    }

    return user;
  }

  /**
   * Branch ids are supplied by the owner because a business has several and
   * only they know which one this person works in. Every id is checked against
   * the caller's own tenant, so a branch from another business is simply not
   * found — it never becomes an assignment.
   */
  private async resolveBranchIds(businessId: string, requested: string[]): Promise<string[]> {
    const unique = [...new Set(requested)];

    const branches = await this.prisma.branch.findMany({
      where: { id: { in: unique }, businessId },
      select: { id: true },
    });

    if (branches.length !== unique.length) {
      throw new NotFoundException('Branch not found');
    }

    return unique;
  }

  private async assertCredentialsAreFree(
    email: string | null,
    phone: string | null,
  ): Promise<void> {
    const clauses: Prisma.UserWhereInput[] = [];

    if (email) {
      clauses.push({ email });
    }

    if (phone) {
      clauses.push({ phone });
    }

    if (clauses.length === 0) {
      return;
    }

    const clash = await this.prisma.user.findFirst({ where: { OR: clauses } });

    if (!clash) {
      return;
    }

    throw new ConflictException(
      email && clash.email === email
        ? 'Barua pepe hii tayari imesajiliwa · That email is already registered'
        : 'Namba hii ya simu tayari imesajiliwa · That phone number is already registered',
    );
  }
}

function toStaffView(user: StaffRecord): StaffMemberView {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    permissions: user.permissions,
    branchIds: user.assignments.map((assignment) => assignment.branchId),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

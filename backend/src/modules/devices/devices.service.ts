import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, DeviceStatus, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import {
  generateEnrollmentCode,
  hashEnrollmentCode,
  normalizeEnrollmentCode,
} from '../../domain/enrollment-token';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../users/users.service';
import { IssueEnrollmentDto } from './dto/issue-enrollment.dto';
import { RedeemEnrollmentDto } from './dto/redeem-enrollment.dto';

export interface DeviceView {
  id: string;
  name: string;
  branchId: string;
  userId: string;
  workerName: string;
  status: DeviceStatus;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * The only moment the enrollment code exists in plaintext. It is returned once,
 * at issue, and never appears in any later response, log line, or audit summary.
 */
export interface IssuedEnrollmentView {
  enrollmentId: string;
  code: string;
  expiresAt: Date;
  userId: string;
  workerName: string;
  branchId: string;
}

/** What the phone learns when it binds itself. No session, no secret. */
export interface EnrolledDeviceView {
  deviceId: string;
  deviceName: string;
  businessId: string;
  businessName: string;
  branchId: string;
  branchName: string;
  workerId: string;
  workerName: string;
  enrolledAt: Date;
}

const DEFAULT_ENROLLMENT_TTL_MINUTES = 60;

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issues a one-time code the owner hands to a worker. The branch is taken
   * from the worker's own assignment rather than the request, so a code can
   * never bind a phone to a branch the worker does not work in.
   */
  async issueEnrollment(
    principal: AuthenticatedUser,
    dto: IssueEnrollmentDto,
  ): Promise<IssuedEnrollmentView> {
    const businessId = requireBusiness(principal);

    const worker = await this.prisma.user.findFirst({
      where: { id: dto.userId, businessId, role: UserRole.WORKER, isActive: true },
      include: { assignments: { select: { branchId: true } } },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const branchId = worker.assignments[0]?.branchId;

    if (!branchId) {
      throw new ConflictException(
        'Mfanyakazi huyu hana tawi · This worker is not assigned to a branch yet',
      );
    }

    const code = generateEnrollmentCode();
    const expiresAt = new Date(Date.now() + this.enrollmentTtlMinutes(dto) * 60_000);

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.deviceEnrollmentToken.create({
        data: {
          businessId,
          branchId,
          userId: worker.id,
          issuedById: principal.userId,
          tokenHash: hashEnrollmentCode(code),
          expiresAt,
        },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId,
          action: AuditAction.DEVICE_ENROLLMENT_ISSUED,
          targetType: 'DeviceEnrollmentToken',
          targetId: row.id,
          // Deliberately no code in the summary: the audit log is readable and
          // the code is a secret.
          summary: `Msimbo wa kuunganisha kifaa umetolewa kwa ${worker.fullName} · Enrollment code issued for ${worker.fullName}`,
        },
        tx,
      );

      return row;
    });

    this.logger.log(`Enrollment issued: ${enrollment.id} for worker ${worker.id}`);

    return {
      enrollmentId: enrollment.id,
      code,
      expiresAt: enrollment.expiresAt,
      userId: worker.id,
      workerName: worker.fullName,
      branchId,
    };
  }

  /**
   * Redeems a code from an unauthenticated phone and mints the device.
   *
   * Two rules from PROGRESS §2 live here. A worker who already holds an active
   * device is refused — the owner revokes the old phone first, so a code alone
   * can never move a worker onto a different handset. And that refusal must not
   * consume the code, or a worker standing in the shop would be stranded until
   * the owner issued another one. Only a successful bind marks it used.
   */
  async redeemEnrollment(dto: RedeemEnrollmentDto): Promise<EnrolledDeviceView> {
    const code = normalizeEnrollmentCode(dto.code);
    const rejected = new UnauthorizedException(
      'Msimbo si sahihi au umekwisha muda · That enrollment code is not valid or has expired',
    );

    if (!code) {
      throw rejected;
    }

    const enrollment = await this.prisma.deviceEnrollmentToken.findUnique({
      where: { tokenHash: hashEnrollmentCode(code) },
      include: {
        user: { select: { id: true, fullName: true, isActive: true } },
        business: { select: { id: true, name: true, isActive: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    // An unknown code, a spent code, an expired code, and a code for a
    // deactivated worker or business are all one answer: a phone must not be
    // able to probe which codes exist or why one failed.
    if (
      !enrollment ||
      enrollment.usedAt !== null ||
      enrollment.expiresAt.getTime() <= Date.now() ||
      !enrollment.user.isActive ||
      !enrollment.business.isActive
    ) {
      throw rejected;
    }

    // Checked before anything is bound, and deliberately before the code is
    // consumed. ACTIVE only: a revoked device must not keep blocking the
    // worker, or revocation would not actually free them.
    const held = await this.prisma.device.findFirst({
      where: { userId: enrollment.userId, status: DeviceStatus.ACTIVE },
      select: { name: true, createdAt: true },
    });

    if (held) {
      throw new ConflictException(
        `Mfanyakazi huyu tayari ana kifaa "${held.name}". Mmiliki lazima akifute kwanza · This worker already has an active device, "${held.name}". The owner must revoke it before a new phone can be enrolled. This code has not been used and still works.`,
      );
    }

    const enrolledAt = new Date();

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          businessId: enrollment.businessId,
          branchId: enrollment.branchId,
          userId: enrollment.userId,
          // The worker's own name, so the owner sees whose phone it is at a
          // glance. A naming convention, not a second identity mechanism.
          name: enrollment.user.fullName,
          lastSeenAt: enrolledAt,
        },
      });

      // Consumed here and nowhere else: usedAt is set only by a bind that
      // actually happened.
      await tx.deviceEnrollmentToken.update({
        where: { id: enrollment.id, usedAt: null },
        data: { usedAt: enrolledAt, deviceId: created.id },
      });

      await this.audit.record(
        {
          userId: enrollment.userId,
          role: UserRole.WORKER,
          deviceId: created.id,
        },
        {
          businessId: enrollment.businessId,
          branchId: enrollment.branchId,
          action: AuditAction.DEVICE_ENROLLED,
          targetType: 'Device',
          targetId: created.id,
          summary: `Kifaa cha ${enrollment.user.fullName} kimeunganishwa · Device enrolled for ${enrollment.user.fullName}`,
        },
        tx,
      );

      return created;
    });

    this.logger.log(`Device enrolled: ${device.id} for worker ${enrollment.userId}`);

    return {
      deviceId: device.id,
      deviceName: device.name,
      businessId: enrollment.business.id,
      businessName: enrollment.business.name,
      branchId: enrollment.branch.id,
      branchName: enrollment.branch.name,
      workerId: enrollment.user.id,
      workerName: enrollment.user.fullName,
      enrolledAt: device.createdAt,
    };
  }

  /**
   * Owners see every device in their business. Managers see only the devices
   * in the branches they are assigned to.
   */
  async listForPrincipal(principal: AuthenticatedUser): Promise<DeviceView[]> {
    const businessId = requireBusiness(principal);

    const where: Prisma.DeviceWhereInput = {
      businessId,
      ...(principal.role === UserRole.OWNER
        ? {}
        : { branch: { assignments: { some: { userId: principal.userId } } } }),
    };

    const devices = await this.prisma.device.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { user: { select: { fullName: true } } },
    });

    return devices.map(toDeviceView);
  }

  /** A device in another tenant answers 404, never 403. */
  async findOne(principal: AuthenticatedUser, deviceId: string): Promise<DeviceView> {
    return toDeviceView(await this.requireDevice(principal, deviceId));
  }

  /**
   * Revocation is on the critical path for a lost or stolen phone, not an
   * administrative afterthought: it is what frees the worker to enroll a new
   * one, and it stops the old handset at the backend on its very next request.
   */
  async revoke(principal: AuthenticatedUser, deviceId: string): Promise<DeviceView> {
    const businessId = requireBusiness(principal);
    const device = await this.requireDevice(principal, deviceId);

    if (device.status === DeviceStatus.REVOKED) {
      throw new ConflictException(
        'Kifaa hiki tayari kimefutwa · That device is already revoked',
      );
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.device.update({
        where: { id: device.id },
        data: {
          status: DeviceStatus.REVOKED,
          revokedAt: new Date(),
          revokedById: principal.userId,
        },
        include: { user: { select: { fullName: true } } },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: updated.branchId,
          action: AuditAction.DEVICE_REVOKED,
          targetType: 'Device',
          targetId: updated.id,
          summary: `Kifaa cha ${updated.user.fullName} kimefutwa · Device revoked for ${updated.user.fullName}`,
        },
        tx,
      );

      return updated;
    });

    this.logger.log(`Device revoked: ${revoked.id} by ${principal.userId}`);

    return toDeviceView(revoked);
  }

  private async requireDevice(
    principal: AuthenticatedUser,
    deviceId: string,
  ): Promise<DeviceRecord> {
    const businessId = requireBusiness(principal);

    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        businessId,
        ...(principal.role === UserRole.OWNER
          ? {}
          : { branch: { assignments: { some: { userId: principal.userId } } } }),
      },
      include: { user: { select: { fullName: true } } },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  private enrollmentTtlMinutes(dto: IssueEnrollmentDto): number {
    return (
      dto.expiresInMinutes ??
      this.config.get<number>('app.enrollmentTtlMinutes', DEFAULT_ENROLLMENT_TTL_MINUTES)
    );
  }
}

type DeviceRecord = Prisma.DeviceGetPayload<{
  include: { user: { select: { fullName: true } } };
}>;

function toDeviceView(device: DeviceRecord): DeviceView {
  return {
    id: device.id,
    name: device.name,
    branchId: device.branchId,
    userId: device.userId,
    workerName: device.user.fullName,
    status: device.status,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    createdAt: device.createdAt,
  };
}

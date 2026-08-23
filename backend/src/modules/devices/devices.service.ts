import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, DeviceStatus, Prisma, UserRole } from '@prisma/client';
import { requireBranchAccess } from '../../common/branch-access';
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
  branchName: string;
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
  deviceName: string;
  branchId: string;
  branchName: string;
}

/** What the phone learns when it binds itself. No session, no secret. */
export interface EnrolledDeviceView {
  deviceId: string;
  deviceName: string;
  businessId: string;
  businessName: string;
  branchId: string;
  branchName: string;
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
   * Issues a one-time code that binds a phone to a **branch**.
   *
   * It used to bind a phone to one worker, and the branch came from that
   * worker's own assignment. Since a device belongs to a branch, the owner
   * names the branch directly — and it is checked against their own business,
   * so a code can never bind a phone into somebody else's shop.
   */
  async issueEnrollment(
    principal: AuthenticatedUser,
    dto: IssueEnrollmentDto,
  ): Promise<IssuedEnrollmentView> {
    const businessId = requireBusiness(principal);
    const branch = await requireBranchAccess(this.prisma, principal, dto.branchId);
    const deviceName = dto.deviceName.trim();

    const code = generateEnrollmentCode();
    const expiresAt = new Date(Date.now() + this.enrollmentTtlMinutes(dto) * 60_000);

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.deviceEnrollmentToken.create({
        data: {
          businessId,
          branchId: branch.id,
          deviceName,
          issuedById: principal.userId,
          tokenHash: hashEnrollmentCode(code),
          expiresAt,
        },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: branch.id,
          action: AuditAction.DEVICE_ENROLLMENT_ISSUED,
          targetType: 'DeviceEnrollmentToken',
          targetId: row.id,
          // Deliberately no code in the summary: the audit log is readable and
          // the code is a secret.
          summary: `Msimbo wa kuunganisha simu "${deviceName}" umetolewa kwa ${branch.name} · Enrollment code issued for "${deviceName}" at ${branch.name}`,
        },
        tx,
      );

      return row;
    });

    this.logger.log(`Enrollment issued: ${enrollment.id} for branch ${branch.id}`);

    return {
      enrollmentId: enrollment.id,
      code,
      expiresAt: enrollment.expiresAt,
      deviceName,
      branchId: branch.id,
      branchName: branch.name,
    };
  }

  /**
   * Redeems a code from an unauthenticated phone and mints the device.
   *
   * The phone chooses nothing: the backend mints the `device_id` and binds the
   * installation to one business and one branch. An unknown code, a spent one,
   * an expired one, and one for a deactivated business are all the same answer,
   * so a phone cannot probe which codes exist or why one failed. Only a bind
   * that actually happened marks the code used.
   *
   * The "this worker already has a phone" refusal that used to live here is
   * gone along with the one-device-per-worker rule — a branch may have as many
   * handsets as it needs.
   */
  async redeemEnrollment(dto: RedeemEnrollmentDto): Promise<EnrolledDeviceView> {
    const code = normalizeEnrollmentCode(dto.code);
    const rejected = new UnauthorizedException(
      'Msimbo si sahihi au umekwisha muda \u00b7 That enrollment code is not valid or has expired',
    );

    if (!code) {
      throw rejected;
    }

    const enrollment = await this.prisma.deviceEnrollmentToken.findUnique({
      where: { tokenHash: hashEnrollmentCode(code) },
      include: {
        business: { select: { id: true, name: true, isActive: true } },
        branch: { select: { id: true, name: true, isActive: true } },
      },
    });

    if (
      !enrollment ||
      enrollment.usedAt !== null ||
      enrollment.expiresAt.getTime() <= Date.now() ||
      !enrollment.business.isActive ||
      !enrollment.branch.isActive
    ) {
      throw rejected;
    }

    const enrolledAt = new Date();

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.device.create({
        data: {
          businessId: enrollment.businessId,
          branchId: enrollment.branchId,
          name: enrollment.deviceName,
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
        // The owner who issued the code is the actor: nobody has signed in on
        // this phone yet, and the device no longer stands for a person.
        { userId: enrollment.issuedById, role: null, deviceId: created.id },
        {
          businessId: enrollment.businessId,
          branchId: enrollment.branchId,
          action: AuditAction.DEVICE_ENROLLED,
          targetType: 'Device',
          targetId: created.id,
          summary: `Simu "${enrollment.deviceName}" imeunganishwa kwenye ${enrollment.branch.name} \u00b7 Device "${enrollment.deviceName}" enrolled at ${enrollment.branch.name}`,
        },
        tx,
      );

      return created;
    });

    this.logger.log(`Device enrolled: ${device.id} at branch ${enrollment.branchId}`);

    return {
      deviceId: device.id,
      deviceName: device.name,
      businessId: enrollment.business.id,
      businessName: enrollment.business.name,
      branchId: enrollment.branch.id,
      branchName: enrollment.branch.name,
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
      include: DEVICE_INCLUDE,
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
        include: DEVICE_INCLUDE,
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          branchId: updated.branchId,
          action: AuditAction.DEVICE_REVOKED,
          targetType: 'Device',
          targetId: updated.id,
          summary: `Simu "${updated.name}" imefutwa · Device "${updated.name}" revoked`,
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
      include: DEVICE_INCLUDE,
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

const DEVICE_INCLUDE = {
  branch: { select: { name: true } },
} satisfies Prisma.DeviceInclude;

type DeviceRecord = Prisma.DeviceGetPayload<{ include: typeof DEVICE_INCLUDE }>;

function toDeviceView(device: DeviceRecord): DeviceView {
  return {
    id: device.id,
    name: device.name,
    branchId: device.branchId,
    branchName: device.branch.name,
    status: device.status,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    createdAt: device.createdAt,
  };
}

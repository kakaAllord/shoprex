import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuditAction, DeviceStatus, User, UserPermission, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeTanzanianPhone } from '../../domain/phone';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { createDefaultPaymentMethods } from '../payments/payment-methods.defaults';
import { SignupDto } from './dto/signup.dto';

export interface AuthenticatedProfile {
  id: string;
  /** Null for workers, who are created with a name and sign in by device. */
  email: string | null;
  phone: string | null;
  fullName: string;
  role: UserRole;
  businessId: string | null;
  businessName: string | null;
  /** What this person may do operationally, within their role. */
  permissions: UserPermission[];
  /** The enrolled device this session is bound to, when there is one. */
  deviceId: string | null;
  branchIds: string[];
  /** Where this account belongs in the web console. */
  console: 'admin' | 'owner';
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedProfile;
}

/** One person who may sign in on a given phone. Never carries a credential. */
export interface DeviceSignInOption {
  userId: string;
  fullName: string;
}

/** One development account offered for one-click sign-in. Never in production. */
export interface DevCredential {
  label: string;
  email: string;
  password: string;
  role: UserRole;
}

export const PASSWORD_SALT_ROUNDS = 10;

/** The library types expiresIn as a template literal, so config strings are cast. */
type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, PASSWORD_SALT_ROUNDS);
  }

  /**
   * Decides which console an account lands in, so no one is asked to pick
   * "am I an admin or an owner?" at sign-in.
   */
  static consoleFor(role: UserRole): 'admin' | 'owner' {
    return role === UserRole.PLATFORM_ADMIN ? 'admin' : 'owner';
  }

  /**
   * Owner self-registration. Creates the business and its owner together, in
   * one transaction, and signs the owner straight in so there is no second
   * step before they can use Shoprex.
   */
  async signupOwner(dto: SignupDto): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();
    const phone = normalizeTanzanianPhone(dto.phone);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (clash) {
      throw new ConflictException(
        clash.email === email
          ? 'Barua pepe hii tayari imesajiliwa · That email is already registered'
          : 'Namba hii ya simu tayari imesajiliwa · That phone number is already registered',
      );
    }

    const passwordHash = await AuthService.hashPassword(dto.password);
    const fullName = dto.fullName?.trim() || email.split('@')[0];
    const timezone = this.config.get<string>('app.defaultTimezone', 'Africa/Dar_es_Salaam');

    const user = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: dto.shopName.trim(), timezone },
      });

      // In the same transaction, so a shop is never left existing but unable
      // to take money.
      await createDefaultPaymentMethods(tx, business.id);

      return tx.user.create({
        data: {
          email,
          phone,
          passwordHash,
          fullName,
          role: UserRole.OWNER,
          businessId: business.id,
        },
        include: { business: true },
      });
    });

    this.logger.log(`Owner signup: ${user.email} for business ${user.businessId}`);

    return this.issueSession(user, user.business?.name ?? null);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { business: true },
    });

    // One message for every failure mode, so the response cannot be used to
    // discover which email addresses exist.
    const invalid = new UnauthorizedException('Barua pepe au nenosiri si sahihi');

    if (!user || !user.isActive) {
      throw invalid;
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw invalid;
    }

    if (user.business && !user.business.isActive) {
      throw new UnauthorizedException('This business account is not active');
    }

    this.logger.log(`Login: ${user.email} (${user.role})`);

    return this.issueSession(user, user.business?.name ?? null);
  }

  /**
   * Who may sign in on this phone.
   *
   * Unauthenticated by necessity: it is what the sign-in screen shows *before*
   * anybody has signed in. The phone proves itself with the `device_id` the
   * backend minted for it, and gets back the people assigned to that device's
   * branch, plus the business owner, who reaches every branch implicitly.
   *
   * It returns names and ids and nothing else \u2014 no password hash, no email, no
   * phone number, no permissions. Whoever holds the handset learns who works at
   * that branch, which is roughly what a rota on the wall tells them. That is a
   * real disclosure, made deliberately, and the device id confines it to one
   * branch of one business. A revoked or unknown device learns nothing at all.
   */
  async deviceSignInOptions(deviceId: string): Promise<DeviceSignInOption[]> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, status: DeviceStatus.ACTIVE, business: { isActive: true } },
      select: { businessId: true, branchId: true },
    });

    if (!device) {
      throw new UnauthorizedException(
        'Kifaa hiki kimefutwa \u00b7 This device has been revoked. Ask the owner to enroll it again.',
      );
    }

    const people = await this.prisma.user.findMany({
      where: {
        businessId: device.businessId,
        isActive: true,
        OR: [
          { role: UserRole.OWNER },
          { assignments: { some: { branchId: device.branchId } } },
        ],
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    return people.map((person) => ({ userId: person.id, fullName: person.fullName }));
  }

  /**
   * Signs a person in on a phone enrolled to their branch.
   *
   * A device belongs to a **branch**, not to one worker, so the handset no
   * longer says who is holding it — the caller names the person and proves it
   * with that person's own password. Which is why `userId` is part of this
   * request: it is not a secret and never was, and the password is still the
   * only thing that grants anything.
   *
   * The person must be reachable from that phone's branch: assigned to it, or
   * the owner of the business, who reaches every branch implicitly. Someone
   * from the next branch over cannot sign in on this counter's phone even with
   * a correct password.
   */
  async loginDevice(deviceId: string, userId: string, password: string): Promise<LoginResult> {
    // One message for every failure, so a phone cannot discover which device
    // ids or user ids exist, or whether a given device is merely revoked.
    const invalid = new UnauthorizedException(
      'Kifaa, mtumiaji au nenosiri si sahihi \u00b7 That device, person, or password is not correct',
    );

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { business: { select: { isActive: true } } },
    });

    if (!device || device.status !== DeviceStatus.ACTIVE || !device.business.isActive) {
      throw invalid;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        businessId: device.businessId,
        isActive: true,
        // Owners reach every branch of their own business; everyone else must
        // be assigned to this phone's branch.
        OR: [
          { role: UserRole.OWNER },
          { assignments: { some: { branchId: device.branchId } } },
        ],
      },
      include: { business: true },
    });

    if (!user) {
      throw invalid;
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw invalid;
    }

    const signedInAt = new Date();

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: signedInAt },
    });

    await this.audit.record(
      { userId: user.id, role: user.role, deviceId: device.id },
      {
        businessId: device.businessId,
        branchId: device.branchId,
        action: AuditAction.DEVICE_SIGNED_IN,
        targetType: 'Device',
        targetId: device.id,
        summary: `${user.fullName} ameingia kwenye simu "${device.name}" \u00b7 ${user.fullName} signed in on "${device.name}"`,
      },
    );

    this.logger.log(`Device login: ${device.id} as ${user.id}`);

    return this.issueSession(user, user.business?.name ?? null, device.id);
  }

  /** Records the sign-in and mints the access token. */
  private async issueSession(
    user: User,
    businessName: string | null,
    deviceId: string | null = null,
  ): Promise<LoginResult> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const expiresIn = this.config.get<string>('app.jwtExpiresIn', '8h');
    const branchIds = await this.branchIdsFor(user);

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        // Present only for a device session. DeviceSessionGuard checks it on
        // every request, so revoking the phone ends this token at once.
        deviceId,
      },
      { expiresIn: expiresIn as ExpiresIn },
    );

    return {
      accessToken,
      expiresIn,
      user: this.toProfile(user, businessName, deviceId, branchIds),
    };
  }

  async profileFor(principal: AuthenticatedUser): Promise<AuthenticatedProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      include: { business: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }

    return this.toProfile(
      user,
      user.business?.name ?? null,
      principal.deviceId,
      await this.branchIdsFor(user),
    );
  }

  /**
   * Owners reach every branch of their business implicitly; managers and
   * workers reach only what they are assigned to. Returned on the profile so a
   * client can render the right branch picker without a second call.
   */
  private async branchIdsFor(user: User): Promise<string[]> {
    if (!user.businessId) {
      return [];
    }

    if (user.role === UserRole.OWNER) {
      const branches = await this.prisma.branch.findMany({
        where: { businessId: user.businessId },
        select: { id: true },
        orderBy: { name: 'asc' },
      });

      return branches.map((branch) => branch.id);
    }

    const assignments = await this.prisma.branchAssignment.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });

    return assignments.map((assignment) => assignment.branchId);
  }

  /**
   * Seeded sign-in shortcuts for local development. Returns an empty list in
   * production, or whenever DEV_LOGIN_AUTOFILL is not explicitly enabled, so a
   * deployed Shoprex can never hand out credentials.
   */
  async devCredentials(): Promise<DevCredential[]> {
    if (!this.isDevAutofillEnabled()) {
      return [];
    }

    const password = this.config.get<string>('app.devSeedPassword', '');
    const emails = [
      this.config.get<string>('app.devAdminEmail', ''),
      this.config.get<string>('app.devOwnerEmail', ''),
    ].filter((email) => email.length > 0);

    if (!password || emails.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { email: { in: emails }, isActive: true },
      include: { business: true },
    });

    return users
      .filter((user): user is typeof user & { email: string } => user.email !== null)
      .sort((a, b) => (a.role === UserRole.PLATFORM_ADMIN ? -1 : b.role === UserRole.PLATFORM_ADMIN ? 1 : 0))
      .map((user) => ({
        label:
          user.role === UserRole.PLATFORM_ADMIN
            ? 'Msimamizi wa Shoprex · Platform admin'
            : `Mmiliki · Owner${user.business ? ` (${user.business.name})` : ''}`,
        email: user.email,
        password,
        role: user.role,
      }));
  }

  isDevAutofillEnabled(): boolean {
    return (
      this.config.get<string>('app.nodeEnv', 'development') !== 'production' &&
      this.config.get<boolean>('app.devLoginAutofill', false)
    );
  }

  private toProfile(
    user: User,
    businessName: string | null,
    deviceId: string | null,
    branchIds: string[],
  ): AuthenticatedProfile {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      businessId: user.businessId,
      businessName,
      permissions: user.permissions,
      deviceId,
      branchIds,
      console: AuthService.consoleFor(user.role),
    };
  }
}

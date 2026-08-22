import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeTanzanianPhone } from '../../domain/phone';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SignupDto } from './dto/signup.dto';

export interface AuthenticatedProfile {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: UserRole;
  businessId: string | null;
  businessName: string | null;
  /** Where this account belongs in the web console. */
  console: 'admin' | 'owner';
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedProfile;
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

  /** Records the sign-in and mints the access token. */
  private async issueSession(user: User, businessName: string | null): Promise<LoginResult> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const expiresIn = this.config.get<string>('app.jwtExpiresIn', '8h');

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
      },
      { expiresIn: expiresIn as ExpiresIn },
    );

    return {
      accessToken,
      expiresIn,
      user: this.toProfile(user, businessName),
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

    return this.toProfile(user, user.business?.name ?? null);
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

  private toProfile(user: User, businessName: string | null): AuthenticatedProfile {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      businessId: user.businessId,
      businessName,
      console: AuthService.consoleFor(user.role),
    };
  }
}

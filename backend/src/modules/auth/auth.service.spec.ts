import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let recordAudit: jest.Mock;
  let config: Record<string, unknown>;

  const buildUser = async (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'owner@shoprex.co.tz',
    passwordHash: await AuthService.hashPassword('shoprex12345'),
    fullName: 'Mmiliki',
    role: UserRole.OWNER,
    businessId: 'business-1',
    isActive: true,
    permissions: [],
    business: { id: 'business-1', name: 'Duka la Mfano', isActive: true },
    ...overrides,
  });

  beforeEach(async () => {
    findUnique = jest.fn();
    update = jest.fn().mockResolvedValue({});
    recordAudit = jest.fn().mockResolvedValue(undefined);
    config = {
      'app.nodeEnv': 'test',
      'app.jwtExpiresIn': '8h',
      'app.devLoginAutofill': false,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique, update, findMany: jest.fn().mockResolvedValue([]) },
            branch: { findMany: jest.fn().mockResolvedValue([]) },
            branchAssignment: { findMany: jest.fn().mockResolvedValue([]) },
            device: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
        { provide: AuditService, useValue: { record: recordAudit } },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('token-123') } },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => config[key] ?? fallback },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('console routing', () => {
    it('sends a platform administrator to the admin console', () => {
      expect(AuthService.consoleFor(UserRole.PLATFORM_ADMIN)).toBe('admin');
    });

    it('sends owners, managers, and workers to the owner console', () => {
      expect(AuthService.consoleFor(UserRole.OWNER)).toBe('owner');
      expect(AuthService.consoleFor(UserRole.MANAGER)).toBe('owner');
      expect(AuthService.consoleFor(UserRole.WORKER)).toBe('owner');
    });
  });

  describe('password hashing', () => {
    it('never stores the plain password', async () => {
      const hash = await AuthService.hashPassword('shoprex12345');

      expect(hash).not.toContain('shoprex12345');
      expect(hash.startsWith('$2')).toBe(true);
    });
  });

  describe('login', () => {
    it('issues a token and the resolved console for valid credentials', async () => {
      findUnique.mockResolvedValue(await buildUser());

      const result = await service.login('owner@shoprex.co.tz', 'shoprex12345');

      expect(result.accessToken).toBe('token-123');
      expect(result.user.console).toBe('owner');
      expect(result.user.businessName).toBe('Duka la Mfano');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('lowercases and trims the submitted email', async () => {
      findUnique.mockResolvedValue(await buildUser());

      await service.login('  OWNER@Shoprex.co.TZ ', 'shoprex12345');

      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'owner@shoprex.co.tz' } }),
      );
    });

    it('rejects a wrong password', async () => {
      findUnique.mockResolvedValue(await buildUser());

      await expect(service.login('owner@shoprex.co.tz', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('gives the same answer for an unknown email as for a wrong password', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@shoprex.co.tz', 'shoprex12345')).rejects.toThrow(
        'Barua pepe au nenosiri si sahihi',
      );
    });

    it('rejects a deactivated user', async () => {
      findUnique.mockResolvedValue(await buildUser({ isActive: false }));

      await expect(service.login('owner@shoprex.co.tz', 'shoprex12345')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a user whose business has been deactivated', async () => {
      findUnique.mockResolvedValue(
        await buildUser({ business: { id: 'business-1', name: 'Shoprex', isActive: false } }),
      );

      await expect(service.login('owner@shoprex.co.tz', 'shoprex12345')).rejects.toThrow(
        'This business account is not active',
      );
    });
  });

  describe('development credentials', () => {
    it('returns nothing when autofill is disabled', async () => {
      expect(await service.devCredentials()).toEqual([]);
      expect(service.isDevAutofillEnabled()).toBe(false);
    });

    it('stays disabled in production even when the flag is on', () => {
      config['app.nodeEnv'] = 'production';
      config['app.devLoginAutofill'] = true;

      expect(service.isDevAutofillEnabled()).toBe(false);
    });
  });
});

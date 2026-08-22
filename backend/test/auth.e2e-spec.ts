import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 1 acceptance checks, run against a real PostgreSQL schema:
 * a platform administrator can create a business and owner; an authenticated
 * owner reaches only their own business; cross-tenant access is refused by the
 * backend, not by the UI.
 */
describe('Authentication and tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const adminEmail = 'e2e-admin@shoprex.co.tz';
  const password = 'shoprex12345';

  let adminToken: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let branchAId: string;

  const login = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Clean slate in the isolated e2e schema.
    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'E2E Platform Admin',
        role: UserRole.PLATFORM_ADMIN,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('login', () => {
    it('rejects an unknown email and a wrong password identically', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@shoprex.co.tz', password })
        .expect(401);

      const wrong = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: 'not-the-password' })
        .expect(401);

      expect(unknown.body.message).toEqual(wrong.body.message);
    });

    it('rejects a malformed email before touching the database', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password })
        .expect(400);
    });

    it('signs in the platform administrator and routes them to the admin console', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password })
        .expect(200);

      expect(response.body.user.role).toBe(UserRole.PLATFORM_ADMIN);
      expect(response.body.user.console).toBe('admin');
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.passwordHash).toBeUndefined();

      adminToken = response.body.accessToken;
    });

    it('keeps the development credentials endpoint closed by default', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/dev-credentials')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('protected routes', () => {
    it('refuses a request with no token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('refuses a forged token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);
    });

    it('returns the profile for a valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.email).toBe(adminEmail);
      expect(response.body.console).toBe('admin');
    });
  });

  describe('platform administrator creates businesses', () => {
    it('creates a business together with its owner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duka la Mfano A',
          ownerFullName: 'Mmiliki A',
          ownerEmail: 'owner-a@shoprex.co.tz',
          ownerPassword: password,
        })
        .expect(201);

      expect(response.body.name).toBe('Duka la Mfano A');
      expect(response.body.userCount).toBe(1);

      await request(app.getHttpServer())
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duka la Mfano B',
          ownerFullName: 'Mmiliki B',
          ownerEmail: 'owner-b@shoprex.co.tz',
          ownerPassword: password,
        })
        .expect(201);

      ownerAToken = await login('owner-a@shoprex.co.tz');
      ownerBToken = await login('owner-b@shoprex.co.tz');
    });

    it('refuses a duplicate owner email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate',
          ownerFullName: 'Mmiliki',
          ownerEmail: 'owner-a@shoprex.co.tz',
          ownerPassword: password,
        })
        .expect(409);
    });

    it('refuses an owner attempting to create a business', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/businesses')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Sneaky Shop',
          ownerFullName: 'Mmiliki',
          ownerEmail: 'sneaky@shoprex.co.tz',
          ownerPassword: password,
        })
        .expect(403);
    });

    it('refuses an owner listing every business on the platform', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/businesses')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('lets an owner create a branch in their own business', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'Tawi Kuu' })
        .expect(201);

      branchAId = response.body.id;
      expect(response.body.name).toBe('Tawi Kuu');
    });

    it('ignores a business id supplied by the client', async () => {
      // businessId is not part of the DTO, so the request is rejected outright
      // rather than silently writing into another tenant.
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'Tawi Hewa', businessId: 'some-other-business' })
        .expect(400);
    });

    it('shows an owner only their own branches', async () => {
      const ownerA = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const ownerB = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);

      expect(ownerA.body).toHaveLength(1);
      expect(ownerB.body).toHaveLength(0);
    });

    it('hides another business branch behind a 404, not a 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchAId}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchAId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);
    });

    it('scopes GET /businesses/me to the token, never to a parameter', async () => {
      const ownerA = await request(app.getHttpServer())
        .get('/api/v1/businesses/me')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const ownerB = await request(app.getHttpServer())
        .get('/api/v1/businesses/me')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);

      expect(ownerA.body.name).toBe('Duka la Mfano A');
      expect(ownerB.body.name).toBe('Duka la Mfano B');
      expect(ownerA.body.id).not.toBe(ownerB.body.id);
    });

    it('refuses a duplicate branch name inside one business', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: 'Tawi Kuu' })
        .expect(409);
    });

    it('lets a different business reuse the same branch name', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ name: 'Tawi Kuu' })
        .expect(201);
    });
  });
});

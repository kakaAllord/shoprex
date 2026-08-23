import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 2: delegated managers and workers, and the permission set that says
 * what each may do.
 *
 * Two tenants throughout, and inside the first tenant two branches, so
 * "another business" and "same business, wrong branch" stay separate cases —
 * both must answer 404, and for different reasons.
 */
describe('Managers, workers, and permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());

  let ownerAToken: string;
  let ownerBToken: string;
  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;

  const signupOwner = async (shopName: string, email: string, phone: string) => {
    const response = await api()
      .post('/api/v1/auth/signup')
      .send({ shopName, email, phone, password, fullName: `Mmiliki ${shopName}` })
      .expect(201);

    return response.body.accessToken as string;
  };

  const createBranch = async (token: string, name: string): Promise<string> => {
    const response = await api()
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return response.body.id as string;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();

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

    await prisma.auditEvent.deleteMany();
    await prisma.deviceEnrollmentToken.deleteMany();
    await prisma.device.deleteMany();
    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    ownerAToken = await signupOwner('Duka A', 'owner-a@shoprex.co.tz', '0712000001');
    ownerBToken = await signupOwner('Duka B', 'owner-b@shoprex.co.tz', '0712000002');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('an owner creates a delegated manager', () => {
    let managerId: string;

    it('creates one with credentials and branch scope', async () => {
      const response = await api()
        .post('/api/v1/users/managers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Neema Mushi',
          email: 'neema@duka-a.co.tz',
          phone: '0713111111',
          password,
          branchIds: [branchA1Id],
          permissions: [UserPermission.SELL, UserPermission.VIEW_REPORTS],
        })
        .expect(201);

      managerId = response.body.id;

      expect(response.body).toMatchObject({
        fullName: 'Neema Mushi',
        email: 'neema@duka-a.co.tz',
        role: UserRole.MANAGER,
        branchIds: [branchA1Id],
        permissions: [UserPermission.SELL, UserPermission.VIEW_REPORTS],
        isActive: true,
      });
    });

    it('normalises the phone number the way owner signup does', async () => {
      const manager = await prisma.user.findUnique({ where: { id: managerId } });

      expect(manager?.phone).toBe('+255713111111');
    });

    it('never returns the password or its hash', async () => {
      const response = await api()
        .get(`/api/v1/users/${managerId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain(password);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('lets that manager sign in with the credentials the owner set', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'neema@duka-a.co.tz', password })
        .expect(200);

      expect(response.body.user).toMatchObject({
        role: UserRole.MANAGER,
        permissions: [UserPermission.SELL, UserPermission.VIEW_REPORTS],
        branchIds: [branchA1Id],
        deviceId: null,
      });
    });

    it('refuses a second manager on the same email', async () => {
      await api()
        .post('/api/v1/users/managers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Mtu Mwingine',
          email: 'neema@duka-a.co.tz',
          password,
          branchIds: [branchA1Id],
          permissions: [],
        })
        .expect(409);
    });
  });

  describe('an owner creates a worker', () => {
    let workerId: string;

    it('creates one from a name, a password, and a branch — with no email', async () => {
      const response = await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Juma Hassan',
          password,
          branchId: branchA1Id,
          permissions: [UserPermission.SELL],
        })
        .expect(201);

      workerId = response.body.id;

      expect(response.body).toMatchObject({
        fullName: 'Juma Hassan',
        email: null,
        role: UserRole.WORKER,
        branchIds: [branchA1Id],
        permissions: [UserPermission.SELL],
      });
    });

    it('mints an internal id at creation that is not a sign-in secret', async () => {
      expect(workerId).toMatch(/^[0-9a-f-]{36}$/);

      // The worker cannot sign in by email, because there is no email at all.
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'juma@duka-a.co.tz', password })
        .expect(401);
    });

    it('rejects an email field on worker creation outright', async () => {
      // forbidNonWhitelisted: a worker has no email, so offering one is a
      // mistake worth failing loudly rather than silently dropping.
      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Mtu Asiyekuwepo',
          email: 'nobody@duka-a.co.tz',
          password,
          branchId: branchA1Id,
          permissions: [],
        })
        .expect(400);
    });

    it('lets a second worker exist without any email collision', async () => {
      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Asha Kimaro',
          password,
          branchId: branchA2Id,
          permissions: [UserPermission.SELL, UserPermission.RECEIVE_STOCK],
        })
        .expect(201);

      const workers = await prisma.user.findMany({
        where: { role: UserRole.WORKER, email: null },
      });

      expect(workers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('permissions are set and changed on the server', () => {
    let workerId: string;

    beforeAll(async () => {
      const response = await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Salma Ally',
          password,
          branchId: branchA1Id,
          permissions: [UserPermission.SELL],
        })
        .expect(201);

      workerId = response.body.id;
    });

    it('replaces the set rather than merging into it', async () => {
      const response = await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ permissions: [UserPermission.VIEW_STOCK] })
        .expect(200);

      expect(response.body.permissions).toEqual([UserPermission.VIEW_STOCK]);
    });

    it('accepts an empty set, which removes every permission', async () => {
      const response = await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ permissions: [] })
        .expect(200);

      expect(response.body.permissions).toEqual([]);
    });

    it('rejects a permission that is not in the enum', async () => {
      await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ permissions: ['DELETE_EVERYTHING'] })
        .expect(400);
    });

    it('refuses an owner from another business, with a 404 rather than a 403', async () => {
      await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({ permissions: [UserPermission.SELL] })
        .expect(404);
    });
  });

  describe('branch scope is checked against the caller’s own tenant', () => {
    it('refuses a worker on another business’s branch, with 404', async () => {
      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Mfanyakazi Haramu',
          password,
          branchId: branchB1Id,
          permissions: [UserPermission.SELL],
        })
        .expect(404);
    });

    it('refuses a manager if any one branch belongs to another business', async () => {
      await api()
        .post('/api/v1/users/managers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Meneja Haramu',
          email: 'haramu@duka-a.co.tz',
          password,
          branchIds: [branchA1Id, branchB1Id],
          permissions: [],
        })
        .expect(404);
    });

    it('creates nothing at all when a branch is refused', async () => {
      const stowaway = await prisma.user.findFirst({
        where: { email: 'haramu@duka-a.co.tz' },
      });

      expect(stowaway).toBeNull();
    });
  });

  describe('tenant isolation on the staff list', () => {
    it('shows business A only its own managers and workers', async () => {
      const response = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const businessIds = await prisma.user.findMany({
        where: { id: { in: response.body.map((staff: { id: string }) => staff.id) } },
        select: { businessId: true },
      });

      expect(response.body.length).toBeGreaterThan(0);
      expect([...new Set(businessIds.map((row) => row.businessId))]).toHaveLength(1);
    });

    it('shows business B an empty list, not business A’s staff', async () => {
      const response = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('never lists the owner’s own account among the staff', async () => {
      const response = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(
        response.body.every((staff: { role: UserRole }) => staff.role !== UserRole.OWNER),
      ).toBe(true);
    });

    it('answers 404 for a staff member in another tenant, never 403', async () => {
      const workerA = await prisma.user.findFirst({
        where: { role: UserRole.WORKER, fullName: 'Juma Hassan' },
      });

      await api()
        .get(`/api/v1/users/${workerA!.id}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    });
  });

  describe('a manager sees only their own branches', () => {
    let managerToken: string;

    beforeAll(async () => {
      await api()
        .post('/api/v1/users/managers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Meneja A1',
          email: 'meneja-a1@duka-a.co.tz',
          password,
          branchIds: [branchA1Id],
          permissions: [UserPermission.VIEW_REPORTS],
        })
        .expect(201);

      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja-a1@duka-a.co.tz', password })
        .expect(200);

      managerToken = login.body.accessToken;
    });

    it('lists staff of the assigned branch only', async () => {
      const response = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(
        response.body.every((staff: { branchIds: string[] }) =>
          staff.branchIds.includes(branchA1Id),
        ),
      ).toBe(true);
    });

    it('answers 404 for staff in a branch of the same business it is not assigned to', async () => {
      const asha = await prisma.user.findFirst({ where: { fullName: 'Asha Kimaro' } });

      await api()
        .get(`/api/v1/users/${asha!.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('refuses a manager creating staff at all', async () => {
      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'Mtu wa Meneja',
          password,
          branchId: branchA1Id,
          permissions: [],
        })
        .expect(403);
    });

    it('refuses a manager changing anyone’s permissions', async () => {
      const salma = await prisma.user.findFirst({ where: { fullName: 'Salma Ally' } });

      await api()
        .patch(`/api/v1/users/${salma!.id}/permissions`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ permissions: [UserPermission.SELL] })
        .expect(403);
    });
  });

  describe('no request body may carry a tenant', () => {
    it('rejects a businessId smuggled into worker creation', async () => {
      const businessB = await prisma.business.findFirst({ where: { name: 'Duka B' } });

      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Mfanyakazi wa Kuiba',
          password,
          branchId: branchA1Id,
          permissions: [],
          businessId: businessB!.id,
        })
        .expect(400);
    });
  });
});

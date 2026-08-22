import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceStatus, PrismaClient, UserPermission, UserRole } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant and branch isolation for the two Phase 2 data-bearing resources,
 * `Device` and `DeviceEnrollmentToken`, plus the audit log they write into.
 *
 * AGENT.md's isolation rule says a resource is checked in the phase that adds
 * it, so Phase 8 confirms rather than discovers. Two tenants, and two branches
 * inside the first, so "another business" and "same business, wrong branch"
 * are proven separately — both answer 404.
 */
describe('Device and audit isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());

  let ownerAToken: string;
  let ownerBToken: string;
  let managerA1Token: string;
  let branchA1Id: string;
  let branchA2Id: string;

  let deviceA1Id: string;
  let deviceA2Id: string;
  let deviceBId: string;

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

  /** Creates a worker and enrolls a phone for them, returning the device id. */
  const enrollPhoneFor = async (
    token: string,
    fullName: string,
    branchId: string,
  ): Promise<string> => {
    const worker = await api()
      .post('/api/v1/users/workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName, password, branchId, permissions: [UserPermission.SELL] })
      .expect(201);

    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: worker.body.id })
      .expect(201);

    const enrolled = await api()
      .post('/api/v1/devices/enroll')
      .send({ code: issued.body.code })
      .expect(200);

    return enrolled.body.deviceId as string;
  };

  beforeAll(async () => {
    // See device-enrollment.e2e-spec.ts: enrollment sits in the strict auth
    // bucket, which is deliberately tiny in backend/.env.
    process.env.RATE_LIMIT_AUTH = '10000';
    process.env.RATE_LIMIT_DEFAULT = '10000';

    const { AppModule } = await import('../src/app.module');

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

    ownerAToken = await signupOwner('Duka A', 'owner-a@isolation.co.tz', '0714000001');
    ownerBToken = await signupOwner('Duka B', 'owner-b@isolation.co.tz', '0714000002');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    const branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    deviceA1Id = await enrollPhoneFor(ownerAToken, 'Juma A1', branchA1Id);
    deviceA2Id = await enrollPhoneFor(ownerAToken, 'Asha A2', branchA2Id);
    deviceBId = await enrollPhoneFor(ownerBToken, 'Neema B1', branchB1Id);

    await api()
      .post('/api/v1/users/managers')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        fullName: 'Meneja A1',
        email: 'meneja-a1@isolation.co.tz',
        password,
        branchIds: [branchA1Id],
        permissions: [UserPermission.VIEW_REPORTS],
      })
      .expect(201);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'meneja-a1@isolation.co.tz', password })
      .expect(200);

    managerA1Token = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('Device — tenant isolation', () => {
    it('lists only the caller’s own devices', async () => {
      const response = await api()
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const ids = response.body.map((device: { id: string }) => device.id).sort();

      expect(ids).toEqual([deviceA1Id, deviceA2Id].sort());
    });

    it('answers 404 for another tenant’s device, never 403', async () => {
      await api()
        .get(`/api/v1/devices/${deviceBId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(404);
    });

    it('refuses to revoke another tenant’s device, with the same 404', async () => {
      await api()
        .post(`/api/v1/devices/${deviceBId}/revoke`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(404);
    });

    it('leaves the other tenant’s device untouched after a refused revocation', async () => {
      const device = await prisma.device.findUnique({ where: { id: deviceBId } });

      expect(device?.status).toBe(DeviceStatus.ACTIVE);
      expect(device?.revokedAt).toBeNull();
    });

    it('reads its own device normally', async () => {
      const response = await api()
        .get(`/api/v1/devices/${deviceA1Id}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: deviceA1Id, branchId: branchA1Id });
    });
  });

  describe('Device — branch isolation inside one tenant', () => {
    it('shows a manager only the devices of their assigned branch', async () => {
      const response = await api()
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${managerA1Token}`)
        .expect(200);

      expect(response.body.map((device: { id: string }) => device.id)).toEqual([deviceA1Id]);
    });

    it('answers 404 for a device in the same business but another branch', async () => {
      await api()
        .get(`/api/v1/devices/${deviceA2Id}`)
        .set('Authorization', `Bearer ${managerA1Token}`)
        .expect(404);
    });

    it('refuses a manager revoking a device at all', async () => {
      await api()
        .post(`/api/v1/devices/${deviceA1Id}/revoke`)
        .set('Authorization', `Bearer ${managerA1Token}`)
        .expect(403);
    });

    it('refuses a manager issuing an enrollment code', async () => {
      const worker = await prisma.user.findFirst({ where: { fullName: 'Juma A1' } });

      await api()
        .post('/api/v1/devices/enrollments')
        .set('Authorization', `Bearer ${managerA1Token}`)
        .send({ userId: worker!.id })
        .expect(403);
    });
  });

  describe('DeviceEnrollmentToken — tenant isolation', () => {
    it('refuses to issue a code for a worker in another business, with 404', async () => {
      const workerB = await prisma.user.findFirst({ where: { fullName: 'Neema B1' } });

      await api()
        .post('/api/v1/devices/enrollments')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ userId: workerB!.id })
        .expect(404);
    });

    it('creates no token when the worker belongs to another business', async () => {
      const workerB = await prisma.user.findFirst({ where: { fullName: 'Neema B1' } });
      const businessA = await prisma.business.findFirst({ where: { name: 'Duka A' } });

      const smuggled = await prisma.deviceEnrollmentToken.findFirst({
        where: { userId: workerB!.id, businessId: businessA!.id },
      });

      expect(smuggled).toBeNull();
    });

    it('binds every issued token to the issuing owner’s own business', async () => {
      const businessA = await prisma.business.findFirst({ where: { name: 'Duka A' } });
      const tokens = await prisma.deviceEnrollmentToken.findMany({
        where: { issuedBy: { business: { name: 'Duka A' } } },
      });

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((token) => token.businessId === businessA!.id)).toBe(true);
    });

    it('never exposes a token through any device read', async () => {
      const response = await api()
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      const body = JSON.stringify(response.body);

      expect(body).not.toContain('tokenHash');
      expect(body).not.toMatch(/"code"/);
    });
  });

  describe('AuditEvent — tenant isolation', () => {
    it('shows an owner only their own business’s events', async () => {
      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .query({ limit: 200 })
        .expect(200);

      const businessA = await prisma.business.findFirst({ where: { name: 'Duka A' } });
      const rows = await prisma.auditEvent.findMany({
        where: { id: { in: response.body.map((event: { id: string }) => event.id) } },
        select: { businessId: true },
      });

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.businessId === businessA!.id)).toBe(true);
    });

    it('matches nothing when narrowed to a device in another tenant', async () => {
      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .query({ deviceId: deviceBId })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('refuses a manager reading the audit log in V1', async () => {
      await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${managerA1Token}`)
        .expect(403);
    });

    it('refuses a worker on a device reading it too', async () => {
      const login = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: deviceA1Id, password })
        .expect(200);

      await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('caps how much of the log one request can pull', async () => {
      await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .query({ limit: 5000 })
        .expect(400);
    });
  });

  describe('a platform administrator is not a tenant', () => {
    let adminToken: string;

    beforeAll(async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'admin@isolation.co.tz',
          passwordHash: (await prisma.user.findFirst({ where: { role: UserRole.OWNER } }))!
            .passwordHash,
          fullName: 'Msimamizi',
          role: UserRole.PLATFORM_ADMIN,
        },
      });

      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: admin.email!, password })
        .expect(200);

      adminToken = login.body.accessToken;
    });

    it('cannot issue a device enrollment — owners only, per the owner’s decision', async () => {
      const worker = await prisma.user.findFirst({ where: { fullName: 'Juma A1' } });

      await api()
        .post('/api/v1/devices/enrollments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: worker!.id })
        .expect(403);
    });

    it('cannot list devices, because it belongs to no business', async () => {
      await api()
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('cannot create a worker either', async () => {
      await api()
        .post('/api/v1/users/workers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Mtu wa Admin', password, branchId: branchA1Id, permissions: [] })
        .expect(403);
    });
  });
});

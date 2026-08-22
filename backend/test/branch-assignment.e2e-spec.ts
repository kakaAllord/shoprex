import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant- and branch-isolation for `BranchAssignment`, the one Phase 1
 * data-bearing model whose read paths no API test previously exercised: the
 * manager/worker branches of `BranchesService.listForPrincipal` and `findOne`
 * are only reachable by a non-owner principal.
 *
 * Written in Phase 1 against managers and workers seeded straight through
 * Prisma, because the endpoints that create them did not exist yet. **Phase 2
 * shipped them, so the seeding is gone**: every principal below is now built
 * the way a real shop builds one — the owner self-registers, creates branches,
 * creates a manager and a worker, issues an enrollment code, and the worker's
 * phone redeems it and signs in. The assertions are unchanged from Phase 1 on
 * purpose; what is being re-proven is that the real creation path produces
 * exactly the same isolation the seeded one did.
 */
describe('Branch assignment isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());

  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;
  let businessAId: string;

  let ownerAToken: string;
  let managerAToken: string;
  let workerAToken: string;
  let managerBToken: string;

  const login = async (email: string): Promise<string> => {
    const response = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.accessToken as string;
  };

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

  const createManager = async (
    token: string,
    fullName: string,
    email: string,
    branchIds: string[],
  ): Promise<void> => {
    await api()
      .post('/api/v1/users/managers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName, email, password, branchIds, permissions: [UserPermission.SELL] })
      .expect(201);
  };

  /**
   * A worker principal the way a real one comes into being: created by the
   * owner, handed a one-time code, and signed in on the phone that redeemed
   * it. There is no email to sign in with, by design.
   */
  const createWorkerOnAPhone = async (
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

    const session = await api()
      .post('/api/v1/auth/device/login')
      .send({ deviceId: enrolled.body.deviceId, password })
      .expect(200);

    return session.body.accessToken as string;
  };

  beforeAll(async () => {
    // Building principals through the real endpoints means signups, sign-ins,
    // and an enrollment — all in the strict auth bucket, which backend/.env
    // sets to 10 a minute. Raised before the module is built, the same way
    // rate-limit.e2e-spec.ts lowers it.
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

    // Two tenants. Business A has two branches; the manager and worker are
    // assigned to the first one only, so "same tenant, wrong branch" stays a
    // distinct case from "different tenant".
    ownerAToken = await signupOwner('Duka A', 'assign-owner-a@shoprex.co.tz', '0715000001');
    const ownerBToken = await signupOwner(
      'Duka B',
      'assign-owner-b@shoprex.co.tz',
      '0715000002',
    );

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    businessAId = (await prisma.business.findFirstOrThrow({ where: { name: 'Duka A' } })).id;

    await createManager(ownerAToken, 'Meneja A', 'assign-manager-a@shoprex.co.tz', [
      branchA1Id,
    ]);
    await createManager(ownerBToken, 'Meneja B', 'assign-manager-b@shoprex.co.tz', [
      branchB1Id,
    ]);

    managerAToken = await login('assign-manager-a@shoprex.co.tz');
    managerBToken = await login('assign-manager-b@shoprex.co.tz');
    workerAToken = await createWorkerOnAPhone(ownerAToken, 'Mfanyakazi A', branchA1Id);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('listing is scoped by assignment, not only by tenant', () => {
    it('shows an owner every branch of their own business', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(response.body.map((branch: { name: string }) => branch.name).sort()).toEqual([
        'Tawi A1',
        'Tawi A2',
      ]);
    });

    it.each([
      ['manager', () => managerAToken],
      ['worker', () => workerAToken],
    ])('shows a %s only the branches they are assigned to', async (_role, token) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${token()}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(branchA1Id);
    });

    it('never leaks another tenant branch into a manager list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${managerBToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(branchB1Id);
      expect(response.body[0].businessId).not.toBe(businessAId);
    });
  });

  describe('reading one branch', () => {
    it.each([
      ['manager', () => managerAToken],
      ['worker', () => workerAToken],
    ])('lets an assigned %s read their own branch', async (_role, token) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchA1Id}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(200);

      expect(response.body.id).toBe(branchA1Id);
    });

    it.each([
      ['manager', () => managerAToken],
      ['worker', () => workerAToken],
    ])(
      'answers 404 when a %s reads an unassigned branch inside their own business',
      async (_role, token) => {
        // Same tenant, no assignment: still 404, so the response never
        // confirms that the branch exists.
        await request(app.getHttpServer())
          .get(`/api/v1/branches/${branchA2Id}`)
          .set('Authorization', `Bearer ${token()}`)
          .expect(404);
      },
    );

    it('answers 404 when a manager reads another tenant branch', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchA1Id}`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .expect(404);
    });

    it('does not let an assignment in one tenant grant access in another', async () => {
      // Manager B holds an assignment — just not to this branch, and not in
      // this business. Holding any assignment must not widen the boundary.
      const assignments = await prisma.branchAssignment.findMany({
        where: { user: { email: 'assign-manager-b@shoprex.co.tz' } },
      });

      expect(assignments).toHaveLength(1);

      await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchA2Id}`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .expect(404);
    });
  });

  describe('writing and tenant scope', () => {
    it.each([
      ['manager', () => managerAToken],
      ['worker', () => workerAToken],
    ])('refuses branch creation by a %s — owners only in V1', async (_role, token) => {
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${token()}`)
        .send({ name: 'Tawi Jipya' })
        .expect(403);
    });

    it('scopes GET /businesses/me for a manager to their own tenant', async () => {
      const managerA = await request(app.getHttpServer())
        .get('/api/v1/businesses/me')
        .set('Authorization', `Bearer ${managerAToken}`)
        .expect(200);

      const managerB = await request(app.getHttpServer())
        .get('/api/v1/businesses/me')
        .set('Authorization', `Bearer ${managerBToken}`)
        .expect(200);

      expect(managerA.body.name).toBe('Duka A');
      expect(managerB.body.name).toBe('Duka B');
    });
  });
});

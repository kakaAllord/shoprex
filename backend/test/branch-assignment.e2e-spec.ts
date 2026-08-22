import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant- and branch-isolation for `BranchAssignment`, the one Phase 1
 * data-bearing model whose read paths no API test previously exercised: the
 * manager/worker branches of `BranchesService.listForPrincipal` and `findOne`
 * are only reachable by a non-owner principal.
 *
 * Managers and workers are seeded directly through Prisma on purpose. The
 * endpoints that create them belong to Phase 2, and AGENT.md's isolation rule
 * says a resource is checked in the phase that adds it — Phase 8 should
 * confirm isolation, not discover it. Replace the seeding with the real
 * creation endpoints once Phase 2 ships them; the assertions stay as they are.
 */
describe('Branch assignment isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';

  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;
  let businessAId: string;

  let ownerAToken: string;
  let managerAToken: string;
  let workerAToken: string;
  let managerBToken: string;

  const login = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.accessToken as string;
  };

  const seedUser = async (
    email: string,
    role: UserRole,
    businessId: string,
    branchIds: string[] = [],
  ): Promise<void> => {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: email,
        role,
        businessId,
        assignments: { create: branchIds.map((branchId) => ({ branchId })) },
      },
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient();

    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    // Two tenants. Business A has two branches; the manager and worker are
    // assigned to the first one only, so "same tenant, wrong branch" stays a
    // distinct case from "different tenant".
    const businessA = await prisma.business.create({ data: { name: 'Duka A' } });
    const businessB = await prisma.business.create({ data: { name: 'Duka B' } });

    const branchA1 = await prisma.branch.create({
      data: { businessId: businessA.id, name: 'Tawi A1' },
    });
    const branchA2 = await prisma.branch.create({
      data: { businessId: businessA.id, name: 'Tawi A2' },
    });
    const branchB1 = await prisma.branch.create({
      data: { businessId: businessB.id, name: 'Tawi B1' },
    });

    businessAId = businessA.id;
    branchA1Id = branchA1.id;
    branchA2Id = branchA2.id;
    branchB1Id = branchB1.id;

    await seedUser('assign-owner-a@shoprex.co.tz', UserRole.OWNER, businessA.id);
    await seedUser('assign-manager-a@shoprex.co.tz', UserRole.MANAGER, businessA.id, [
      branchA1.id,
    ]);
    await seedUser('assign-worker-a@shoprex.co.tz', UserRole.WORKER, businessA.id, [
      branchA1.id,
    ]);
    await seedUser('assign-manager-b@shoprex.co.tz', UserRole.MANAGER, businessB.id, [
      branchB1.id,
    ]);

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

    ownerAToken = await login('assign-owner-a@shoprex.co.tz');
    managerAToken = await login('assign-manager-a@shoprex.co.tz');
    workerAToken = await login('assign-worker-a@shoprex.co.tz');
    managerBToken = await login('assign-manager-b@shoprex.co.tz');
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

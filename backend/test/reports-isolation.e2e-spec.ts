import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant and branch isolation for Phase 7's reports.
 *
 * AGENT.md's isolation rule says a resource is checked in the phase that adds
 * it, so Phase 8 confirms rather than discovers. Reports add **no new table**,
 * which is precisely why this suite is needed rather than optional: a report
 * is a *read across* every table a shop owns — sales, lines, payments,
 * receipts, users, branches — so a single missing tenant clause here leaks
 * more at once than any single-resource route could. A total is a summary of
 * rows the caller was never allowed to see one at a time.
 *
 * Two shops, and two branches inside the first, so "another business" and
 * "same business, wrong branch" are proven separately. They are different
 * mistakes and they deserve different tests.
 *
 * The PDF is checked alongside the JSON at every step. A file download is
 * exactly the sort of route that gets its guard added last, or not at all.
 */
describe('Report isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  const DAY = '2026-08-21';

  let ownerAToken: string;
  let ownerBToken: string;
  /** Same tenant as A, assigned to A1 only. The interesting token. */
  let managerA1Token: string;
  /** Same tenant as A, assigned to A1, holding no VIEW_REPORTS. */
  let workerA1Token: string;

  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;

  let keyCounter = 0;
  const nextKey = () => `report-isolation-${(keyCounter += 1)}-${Date.now()}`;

  const dailyUrl = (branchId: string) => `/api/v1/branches/${branchId}/reports/daily`;
  const pdfUrl = (branchId: string) => `/api/v1/branches/${branchId}/reports/daily.pdf`;

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
      .set(authed(token))
      .send({ name })
      .expect(201);

    return response.body.id as string;
  };

  /** A product, stock for it, and one sale, all inside one branch. */
  const tradeIn = async (
    token: string,
    branchId: string,
    productName: string,
    amountTzs: number,
    debtorName?: string,
  ): Promise<void> => {
    const product = await api()
      .post('/api/v1/products')
      .set(authed(token))
      .send({ name: productName, units: [{ name: 'Kipande', priceTzs: amountTzs }] })
      .expect(201);

    const unitId = product.body.units[0].id as string;

    await api()
      .post(`/api/v1/branches/${branchId}/stock-receipts`)
      .set(authed(token))
      .send({
        lines: [{ productId: product.body.id, productUnitId: unitId, quantity: 50, unitCostTzs: 10 }],
      })
      .expect(201);

    const methods = (
      await api().get('/api/v1/payment-methods').set(authed(token)).expect(200)
    ).body as Array<{ id: string; kind: string }>;

    const method = methods.find((entry) => entry.kind === (debtorName ? 'DEBT' : 'CASH'))!;

    const sale = await api()
      .post(`/api/v1/branches/${branchId}/sales`)
      .set(authed(token))
      .send({
        idempotencyKey: nextKey(),
        lines: [{ productId: product.body.id, productUnitId: unitId, quantity: 1 }],
        payments: [
          debtorName
            ? { paymentMethodId: method.id, amountTzs, debtorName }
            : { paymentMethodId: method.id, amountTzs, cashReceivedTzs: amountTzs },
        ],
      })
      .expect(201);

    // Put both the sale and the delivery inside the day under test. The route
    // never accepts a timestamp — that is the point — so the test arranges it.
    await prisma.sale.update({
      where: { id: sale.body.id },
      data: { createdAt: new Date(`${DAY}T09:00:00Z`) },
    });
    await prisma.stockReceipt.updateMany({
      where: { branchId },
      data: { createdAt: new Date(`${DAY}T07:00:00Z`) },
    });
  };

  beforeAll(async () => {
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

    await prisma.salePayment.deleteMany();
    await prisma.saleLine.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.stockReceiptLine.deleteMany();
    await prisma.stockReceipt.deleteMany();
    await prisma.physicalStock.deleteMany();
    await prisma.barcode.deleteMany();
    await prisma.unitRelationship.deleteMany();
    await prisma.productUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.deviceEnrollmentToken.deleteMany();
    await prisma.device.deleteMany();
    await prisma.paymentMethod.deleteMany();
    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    ownerAToken = await signupOwner('Duka A', 'owner@duka-a.co.tz', '0716000080');
    ownerBToken = await signupOwner('Duka B', 'owner@duka-b.co.tz', '0716000081');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    // Distinct amounts and distinct debtor names, so a leak is unmistakable
    // rather than an ambiguous coincidence of equal numbers.
    await tradeIn(ownerAToken, branchA1Id, 'Bidhaa ya A1', 1_100);
    await tradeIn(ownerAToken, branchA2Id, 'Bidhaa ya A2', 2_200, 'Mdaiwa wa A2');
    await tradeIn(ownerBToken, branchB1Id, 'Bidhaa ya B1', 9_900, 'Mdaiwa wa B1');

    const manager = await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerAToken))
      .send({
        fullName: 'Meneja A1',
        email: 'meneja@duka-a.co.tz',
        password,
        branchIds: [branchA1Id],
        permissions: [UserPermission.VIEW_REPORTS],
      })
      .expect(201);

    expect(manager.body.id).toBeTruthy();

    managerA1Token = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja@duka-a.co.tz', password })
        .expect(200)
    ).body.accessToken;

    const worker = await api()
      .post('/api/v1/users/workers')
      .set(authed(ownerAToken))
      .send({
        fullName: 'Mfanyakazi A1',
        password,
        branchId: branchA1Id,
        permissions: [UserPermission.SELL],
      })
      .expect(201);

    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerAToken))
      .send({ branchId: branchA1Id, deviceName: 'Simu ya A1' })
      .expect(201);

    const enrolled = await api()
      .post('/api/v1/devices/enroll')
      .send({ code: issued.body.code })
      .expect(200);

    workerA1Token = (
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: enrolled.body.deviceId, userId: worker.body.id, password })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------

  describe('another tenant’s branch is not found, never forbidden', () => {
    /**
     * `404`, not `403`. A `403` would confirm the branch id exists somewhere,
     * which is a fact about another shop that no caller is entitled to.
     */
    it('answers 404 for another shop’s branch report', async () => {
      await api()
        .get(dailyUrl(branchB1Id))
        .query({ date: DAY })
        .set(authed(ownerAToken))
        .expect(404);
    });

    it('answers 404 for another shop’s branch PDF', async () => {
      await api()
        .get(pdfUrl(branchB1Id))
        .query({ date: DAY })
        .set(authed(ownerAToken))
        .expect(404);
    });

    it('answers 404 in the other direction too', async () => {
      await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(ownerBToken))
        .expect(404);
      await api()
        .get(pdfUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(ownerBToken))
        .expect(404);
    });
  });

  describe('no figure from another tenant reaches a report', () => {
    it('totals only the caller’s own shop', async () => {
      const a = (
        await api().get(dailyUrl(branchA1Id)).query({ date: DAY }).set(authed(ownerAToken)).expect(200)
      ).body;
      const b = (
        await api().get(dailyUrl(branchB1Id)).query({ date: DAY }).set(authed(ownerBToken)).expect(200)
      ).body;

      expect(a.totals.salesTotalTzs).toBe(1_100);
      expect(b.totals.salesTotalTzs).toBe(9_900);
      expect(a.business.name).toBe('Duka A');
      expect(b.business.name).toBe('Duka B');
    });

    it('never names another tenant’s product in the best sellers or the deliveries', async () => {
      const a = (
        await api().get(dailyUrl(branchA1Id)).query({ date: DAY }).set(authed(ownerAToken)).expect(200)
      ).body;

      const names = [
        ...a.topProducts.map((row: { productName: string }) => row.productName),
        ...a.received.rows.map((row: { productName: string }) => row.productName),
      ];

      expect(names).toContain('Bidhaa ya A1');
      expect(names).not.toContain('Bidhaa ya B1');
      expect(names).not.toContain('Bidhaa ya A2');
    });

    it('never names another tenant’s debtor', async () => {
      const b = (
        await api().get(dailyUrl(branchB1Id)).query({ date: DAY }).set(authed(ownerBToken)).expect(200)
      ).body;

      expect(b.debts.map((row: { debtorName: string }) => row.debtorName)).toEqual(['Mdaiwa wa B1']);
    });

    it('never names another tenant’s staff among the sellers', async () => {
      const a = (
        await api().get(dailyUrl(branchA1Id)).query({ date: DAY }).set(authed(ownerAToken)).expect(200)
      ).body;

      expect(a.sellers.map((row: { name: string }) => row.name)).toEqual(['Mmiliki Duka A']);
    });

    /**
     * The generated file gets the same scrutiny as the JSON: a PDF is still a
     * response body, and a leak inside one is no less a leak for being bytes.
     */
    it('leaks nothing of another tenant into the PDF', async () => {
      const response = await api()
        .get(pdfUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(ownerAToken))
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      const pdf = (response.body as Buffer).toString('latin1');

      expect(pdf).toContain('Duka A');
      expect(pdf).toContain('Tawi A1');
      expect(pdf).not.toContain('Duka B');
      expect(pdf).not.toContain('Tawi B1');
      expect(pdf).not.toContain('Mdaiwa wa B1');
      expect(pdf).not.toContain('Bidhaa ya B1');
      expect(pdf).not.toContain('TSh 9,900');
    });
  });

  describe('the branch comparison is scoped, not merely sorted', () => {
    it('shows an owner every branch of their own shop and no other', async () => {
      const response = await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(ownerAToken))
        .expect(200);

      const names = response.body.branches.map((row: { branchName: string }) => row.branchName);

      expect(names.sort()).toEqual(['Tawi A1', 'Tawi A2']);
      expect(response.body.totals.salesTotalTzs).toBe(3_300);
    });

    it('shows a manager only the branches they were assigned', async () => {
      const response = await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(200);

      expect(response.body.branches).toHaveLength(1);
      expect(response.body.branches[0].branchName).toBe('Tawi A1');
      // Not the shop's 3,300: a manager's total is their own branches' total.
      expect(response.body.totals.salesTotalTzs).toBe(1_100);
    });
  });

  describe('same tenant, wrong branch', () => {
    /**
     * Still `404`, even inside the caller's own shop. A manager learning that
     * branch A2 exists by getting a `403` is a smaller leak than a cross-tenant
     * one, but it is the same kind of leak and it gets the same answer.
     */
    it('answers 404 for a branch in their own shop they were not given', async () => {
      await api()
        .get(dailyUrl(branchA2Id))
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(404);
      await api()
        .get(pdfUrl(branchA2Id))
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(404);
    });

    it('lets them read the branch they were given', async () => {
      const response = await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(200);

      expect(response.body.branch.name).toBe('Tawi A1');
    });
  });

  describe('permission is enforced on the server, not in a client', () => {
    it('refuses a worker who holds SELL but not VIEW_REPORTS', async () => {
      await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(workerA1Token))
        .expect(403);
      await api()
        .get(pdfUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(workerA1Token))
        .expect(403);
      await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(workerA1Token))
        .expect(403);
    });

    /**
     * Permissions are read from the database per request rather than from the
     * token, so taking one away takes effect now — not when an eight-hour
     * token expires. The same rule the sales list already relies on.
     */
    it('stops answering the moment the permission is taken away', async () => {
      const manager = await prisma.user.findFirst({ where: { email: 'meneja@duka-a.co.tz' } });

      await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(200);

      await api()
        .patch(`/api/v1/users/${manager!.id}/permissions`)
        .set(authed(ownerAToken))
        .send({ permissions: [] })
        .expect(200);

      // The same, still-unexpired token.
      await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: DAY })
        .set(authed(managerA1Token))
        .expect(403);

      await api()
        .patch(`/api/v1/users/${manager!.id}/permissions`)
        .set(authed(ownerAToken))
        .send({ permissions: [UserPermission.VIEW_REPORTS] })
        .expect(200);
    });

    it('refuses an unauthenticated caller on every report route', async () => {
      await api().get(dailyUrl(branchA1Id)).query({ date: DAY }).expect(401);
      await api().get(pdfUrl(branchA1Id)).query({ date: DAY }).expect(401);
      await api().get('/api/v1/reports/branches').query({ date: DAY }).expect(401);
    });
  });

  describe('the date is not a way around any of it', () => {
    it('still refuses another tenant’s branch whatever date is asked for', async () => {
      for (const date of [DAY, '2026-01-01', undefined]) {
        await api()
          .get(dailyUrl(branchB1Id))
          .query(date ? { date } : {})
          .set(authed(ownerAToken))
          .expect(404);
      }
    });

    it('refuses a malformed date without revealing whether the branch exists', async () => {
      // Both answer 400 — the date is rejected by validation before anything
      // looks a branch up, so the shape of the answer says nothing either way.
      await api()
        .get(dailyUrl(branchA1Id))
        .query({ date: 'yesterday' })
        .set(authed(ownerAToken))
        .expect(400);
      await api()
        .get(dailyUrl(branchB1Id))
        .query({ date: 'yesterday' })
        .set(authed(ownerAToken))
        .expect(400);
    });
  });
});

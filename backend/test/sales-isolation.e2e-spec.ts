import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant and branch isolation for the Phase 4 data-bearing resources:
 * `PaymentMethod`, `Sale`, `SaleLine`, and `SalePayment`.
 *
 * AGENT.md's isolation rule says a resource is checked in the phase that adds
 * it, so Phase 8 confirms rather than discovers. Two shops, and two branches
 * inside the first, so "another business" and "same business, wrong branch"
 * are proven separately — a manager assigned to one branch selling out of
 * another is a real mistake, and it is not the same mistake as a cross-tenant
 * read.
 */
describe('Sales and payment isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  let ownerAToken: string;
  let ownerBToken: string;
  let managerA1Token: string;

  let branchA1Id: string;
  let branchA2Id: string;
  let branchB1Id: string;

  let productAId: string;
  let unitAId: string;
  let productBId: string;
  let unitBId: string;

  let cashAId: string;
  let cashBId: string;

  let saleA1Id: string;

  let keyCounter = 0;
  const nextKey = () => `isolation-${(keyCounter += 1)}-${Date.now()}`;

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

  const createStockedProduct = async (token: string, branchId: string, name: string) => {
    const product = await api()
      .post('/api/v1/products')
      .set(authed(token))
      .send({ name, units: [{ name: 'Piece', priceTzs: 1_000 }] })
      .expect(201);

    const unitId = product.body.units[0].id as string;

    await api()
      .post(`/api/v1/branches/${branchId}/stock-receipts`)
      .set(authed(token))
      .send({ lines: [{ productId: product.body.id, productUnitId: unitId, quantity: 100 }] })
      .expect(201);

    return { id: product.body.id as string, unitId };
  };

  const cashMethodOf = async (token: string): Promise<string> => {
    const response = await api()
      .get('/api/v1/payment-methods')
      .set(authed(token))
      .expect(200);

    return response.body.find((method: { kind: string }) => method.kind === 'CASH').id;
  };

  const sell = (token: string, branchId: string, productId: string, unitId: string) =>
    api()
      .post(`/api/v1/branches/${branchId}/sales`)
      .set(authed(token))
      .send({
        idempotencyKey: nextKey(),
        lines: [{ productId, productUnitId: unitId, quantity: 1 }],
        payments: [
          {
            paymentMethodId: token === ownerBToken ? cashBId : cashAId,
            amountTzs: 1_000,
          },
        ],
      });

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

    ownerAToken = await signupOwner('Duka A', 'owner@duka-a.co.tz', '0716000020');
    ownerBToken = await signupOwner('Duka B', 'owner@duka-b.co.tz', '0716000021');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    cashAId = await cashMethodOf(ownerAToken);
    cashBId = await cashMethodOf(ownerBToken);

    ({ id: productAId, unitId: unitAId } = await createStockedProduct(
      ownerAToken,
      branchA1Id,
      'Bidhaa ya A',
    ));
    ({ id: productBId, unitId: unitBId } = await createStockedProduct(
      ownerBToken,
      branchB1Id,
      'Bidhaa ya B',
    ));

    // A manager who works in A1 only. Their token is the interesting one: same
    // tenant, wrong branch.
    const manager = await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerAToken))
      .send({
        fullName: 'Meneja A1',
        email: 'meneja@duka-a.co.tz',
        password,
        branchIds: [branchA1Id],
        permissions: [UserPermission.SELL],
      })
      .expect(201);

    expect(manager.body.id).toBeTruthy();

    managerA1Token = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja@duka-a.co.tz', password })
        .expect(200)
    ).body.accessToken;

    saleA1Id = (await sell(ownerAToken, branchA1Id, productAId, unitAId).expect(201)).body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('payment methods belong to one shop', () => {
    it('gives each shop its own set, sharing no ids', async () => {
      expect(cashAId).not.toBe(cashBId);
    });

    it('refuses another shop’s payment method, as not available', async () => {
      // A 404 rather than a 403: shop B must not learn that this id exists.
      await api()
        .post(`/api/v1/branches/${branchB1Id}/sales`)
        .set(authed(ownerBToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productBId, productUnitId: unitBId, quantity: 1 }],
          payments: [{ paymentMethodId: cashAId, amountTzs: 1_000 }],
        })
        .expect(404);
    });

    it('writes no sale when the method is refused', async () => {
      expect(await prisma.sale.count({ where: { branchId: branchB1Id } })).toBe(0);
    });
  });

  describe('a sale belongs to one shop', () => {
    it('hides another shop’s sale behind a 404, not a 403', async () => {
      await api()
        .get(`/api/v1/branches/${branchB1Id}/sales/${saleA1Id}`)
        .set(authed(ownerBToken))
        .expect(404);
    });

    it('refuses to read it even by naming the right branch', async () => {
      // The branch id is shop A's, so shop B fails the branch check first —
      // and still learns nothing.
      await api()
        .get(`/api/v1/branches/${branchA1Id}/sales/${saleA1Id}`)
        .set(authed(ownerBToken))
        .expect(404);
    });

    it('refuses to sell another shop’s product', async () => {
      await api()
        .post(`/api/v1/branches/${branchB1Id}/sales`)
        .set(authed(ownerBToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: cashBId, amountTzs: 1_000 }],
        })
        .expect(404);
    });

    it('refuses to sell into another shop’s branch', async () => {
      await api()
        .post(`/api/v1/branches/${branchA1Id}/sales`)
        .set(authed(ownerBToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productBId, productUnitId: unitBId, quantity: 1 }],
          payments: [{ paymentMethodId: cashBId, amountTzs: 1_000 }],
        })
        .expect(404);
    });
  });

  describe('a branch is a boundary inside one shop too', () => {
    it('lets the manager sell from the branch they are assigned to', async () => {
      await sell(managerA1Token, branchA1Id, productAId, unitAId).expect(201);
    });

    it('refuses the same manager selling out of a branch they are not', async () => {
      // Same business, same product, same payment method. The only thing wrong
      // is the branch — and it answers 404, not 403.
      await api()
        .post(`/api/v1/branches/${branchA2Id}/sales`)
        .set(authed(managerA1Token))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: cashAId, amountTzs: 1_000 }],
        })
        .expect(404);
    });

    it('refuses the same manager reading a sale from a branch they are not in', async () => {
      // The owner may sell out of A2 — under the negative-stock policy the
      // empty branch is no obstacle, it simply goes negative and is flagged.
      const otherBranchSale = await sell(
        ownerAToken,
        branchA2Id,
        productAId,
        unitAId,
      ).expect(201);

      expect(otherBranchSale.body.hasStockInconsistency).toBe(true);

      // The manager assigned only to A1 cannot read it, in either branch's URL.
      await api()
        .get(`/api/v1/branches/${branchA2Id}/sales/${otherBranchSale.body.id}`)
        .set(authed(managerA1Token))
        .expect(404);

      await api()
        .get(`/api/v1/branches/${branchA2Id}/sales/${saleA1Id}`)
        .set(authed(managerA1Token))
        .expect(404);
    });
  });

  describe('idempotency keys do not leak across shops', () => {
    it('lets two shops use the same key for two different sales', async () => {
      // The key is unique *per business*, not globally. Two shops that both
      // number their sales from 1 must not collide.
      const shared = `shared-key-${Date.now()}`;

      const a = await api()
        .post(`/api/v1/branches/${branchA1Id}/sales`)
        .set(authed(ownerAToken))
        .send({
          idempotencyKey: shared,
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: cashAId, amountTzs: 1_000 }],
        })
        .expect(201);

      const b = await api()
        .post(`/api/v1/branches/${branchB1Id}/sales`)
        .set(authed(ownerBToken))
        .send({
          idempotencyKey: shared,
          lines: [{ productId: productBId, productUnitId: unitBId, quantity: 1 }],
          payments: [{ paymentMethodId: cashBId, amountTzs: 1_000 }],
        })
        .expect(201);

      expect(a.body.id).not.toBe(b.body.id);
      expect(await prisma.sale.count({ where: { idempotencyKey: shared } })).toBe(2);
    });

    it('refuses to reuse one key across two branches of the same shop', async () => {
      // Within one business the key means "this one sale". Reusing it in
      // another branch is not a retry, and returning the first branch's
      // receipt would be worse than an error.
      const key = nextKey();

      await api()
        .post(`/api/v1/branches/${branchA1Id}/sales`)
        .set(authed(ownerAToken))
        .send({
          idempotencyKey: key,
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: cashAId, amountTzs: 1_000 }],
        })
        .expect(201);

      await api()
        .post(`/api/v1/branches/${branchA2Id}/sales`)
        .set(authed(ownerAToken))
        .send({
          idempotencyKey: key,
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: cashAId, amountTzs: 1_000 }],
        })
        .expect(409);
    });
  });

  describe('every sale row carries its own tenant', () => {
    it('never writes a sale, line, or payment outside the seller’s business', async () => {
      const businessA = (
        await prisma.business.findFirstOrThrow({ where: { name: 'Duka A' } })
      ).id;

      const strays = await prisma.sale.findMany({
        where: { branchId: { in: [branchA1Id, branchA2Id] }, businessId: { not: businessA } },
      });

      expect(strays).toEqual([]);
    });

    it('never puts another tenant’s product or payment method on a line', async () => {
      // A sale line names a product, and a payment names a method. Both ids
      // arrive from a client, so the only thing keeping them inside the tenant
      // is the resolution that rejected them — this reads the rows back and
      // checks that it held.
      const lines = await prisma.saleLine.findMany({
        include: { sale: { select: { businessId: true } }, product: { select: { businessId: true } } },
      });

      expect(lines.length).toBeGreaterThan(0);
      expect(
        lines.filter((line) => line.product.businessId !== line.sale.businessId),
      ).toEqual([]);

      const payments = await prisma.salePayment.findMany({
        include: {
          sale: { select: { businessId: true } },
          paymentMethod: { select: { businessId: true } },
        },
      });

      expect(payments.length).toBeGreaterThan(0);
      expect(
        payments.filter(
          (payment) => payment.paymentMethod.businessId !== payment.sale.businessId,
        ),
      ).toEqual([]);
    });
  });
});

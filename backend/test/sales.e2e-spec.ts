import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethodKind,
  PrismaClient,
  StockDirection,
  StockMovementReason,
  UserPermission,
} from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 4's acceptance check, driven end to end over HTTP as the person it is
 * written about: *a worker*, signed in on the one phone enrolled to them.
 *
 *   "A worker can scan an existing item, type and select an item, add an
 *    unknown item inline, adjust quantities, complete cash/mixed/debt payment
 *    against the seeded payment methods, view a receipt, and begin the next
 *    sale without dead ends."
 *
 * Nothing here is exercised through a service class. The point is not that the
 * arithmetic is right — `src/domain/sale.spec.ts` proves that against pure
 * functions — but that the arithmetic is what the API actually runs, for a
 * caller holding nothing but a worker's device token.
 */
describe('The selling flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  // A barcode with a genuinely correct check digit — the scanner path refuses
  // anything else, so a made-up number would prove nothing.
  const cokeBarcode = '5901234123457';

  let ownerToken: string;
  let workerToken: string;
  let workerId: string;
  let deviceId: string;
  let branchId: string;

  let cashMethodId: string;
  let mobileMethodId: string;
  let debtMethodId: string;

  let cokeId: string;
  let cokeCartonId: string;
  let cokePieceId: string;

  /** A key unique to each attempt, the way the phone builds one per sale. */
  let saleCounter = 0;
  const nextKey = () => `e2e-sale-${(saleCounter += 1)}-${Date.now()}`;

  const stockOf = async (productId: string) =>
    (
      await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200)
    ).body as {
      packages: Array<{ unitName: string; quantity: number }>;
      normalizedQuantity: number;
    };

  const describePackages = (packages: Array<{ unitName: string; quantity: number }>) =>
    packages.map((entry) => `${entry.quantity} ${entry.unitName}`).join(' + ');

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

    // 1 — a shop exists, with a branch.
    const signup = await api()
      .post('/api/v1/auth/signup')
      .send({
        shopName: 'Duka la Mauzo',
        email: 'owner@mauzo.co.tz',
        phone: '0716000010',
        password,
        fullName: 'Mmiliki Mauzo',
      })
      .expect(201);

    ownerToken = signup.body.accessToken;

    branchId = (
      await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Tawi Kuu' })
        .expect(201)
    ).body.id;

    // 2 — a worker who may sell, on the one phone enrolled to them.
    workerId = (
      await api()
        .post('/api/v1/users/workers')
        .set(authed(ownerToken))
        .send({
          fullName: 'Juma Hassan',
          password,
          branchId,
          permissions: [UserPermission.SELL],
        })
        .expect(201)
    ).body.id;

    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerToken))
      .send({ branchId, deviceName: 'Simu ya kaunta' })
      .expect(201);

    deviceId = (
      await api().post('/api/v1/devices/enroll').send({ code: issued.body.code }).expect(200)
    ).body.deviceId;

    workerToken = (
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: workerId, password })
        .expect(200)
    ).body.accessToken;

    // 3 — one product the shop already knows, with a barcode on it.
    const coke = await api()
      .post('/api/v1/products')
      .set(authed(ownerToken))
      .send({
        name: 'Coca-Cola 500ml',
        units: [
          { name: 'Carton', priceTzs: 12_000 },
          { name: 'Piece', priceTzs: 1_000 },
        ],
        relationships: [{ parentUnit: 'Carton', childUnit: 'Piece', factor: 6 }],
        barcode: cokeBarcode,
      })
      .expect(201);

    cokeId = coke.body.id;
    cokeCartonId = coke.body.units.find((unit: { name: string }) => unit.name === 'Carton').id;
    cokePieceId = coke.body.units.find((unit: { name: string }) => unit.name === 'Piece').id;

    // 4 — stock on the shelf: 10 Cartons = 60 Pieces.
    await api()
      .post(`/api/v1/branches/${branchId}/stock-receipts`)
      .set(authed(ownerToken))
      .send({ lines: [{ productId: cokeId, productUnitId: cokeCartonId, quantity: 10 }] })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------

  describe('the shop can take money at all', () => {
    it('was created with the seeded default payment methods', async () => {
      const response = await api()
        .get('/api/v1/payment-methods')
        .set(authed(workerToken))
        .expect(200);

      expect(
        response.body.map((method: { name: string; kind: string }) => [
          method.name,
          method.kind,
        ]),
      ).toEqual([
        ['Taslimu', PaymentMethodKind.CASH],
        ['Pesa ya simu', PaymentMethodKind.MOBILE_MONEY],
        ['Deni', PaymentMethodKind.DEBT],
      ]);

      cashMethodId = response.body[0].id;
      mobileMethodId = response.body[1].id;
      debtMethodId = response.body[2].id;
    });

    it('offers them to the worker holding the phone, not only to the owner', async () => {
      // The seller is who needs the buttons; nobody hands the phone back to
      // the owner to choose how a customer is paying.
      const response = await api()
        .get('/api/v1/payment-methods')
        .set(authed(workerToken))
        .expect(200);

      expect(response.body).toHaveLength(3);
    });

    it('never offers another shop’s methods', async () => {
      const other = await api()
        .post('/api/v1/auth/signup')
        .send({
          shopName: 'Duka Lingine',
          email: 'owner@lingine.co.tz',
          phone: '0716000011',
          password,
          fullName: 'Mmiliki Lingine',
        })
        .expect(201);

      const theirs = await api()
        .get('/api/v1/payment-methods')
        .set(authed(other.body.accessToken))
        .expect(200);

      expect(theirs.body).toHaveLength(3);
      expect(theirs.body.map((method: { id: string }) => method.id)).not.toContain(
        cashMethodId,
      );
    });
  });

  describe('1 — the worker scans an item that already exists', () => {
    it('finds it by barcode, priced and ready to add', async () => {
      const response = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: cokeBarcode })
        .set(authed(workerToken))
        .expect(200);

      expect(response.body.id).toBe(cokeId);
      expect(
        response.body.units.find((unit: { name: string }) => unit.name === 'Piece').priceTzs,
      ).toBe(1_000);
    });

    it('sells 2 Pieces for cash and gives the right change', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 2 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 2_000, cashReceivedTzs: 5_000 },
          ],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(2_000);
      expect(sale.body.changeTzs).toBe(3_000);
      expect(sale.body.payments[0].changeTzs).toBe(3_000);
      expect(sale.body.lines[0].lineTotalTzs).toBe(2_000);
      // A shop with stock on the shelf sells without any flag being raised.
      expect(sale.body.hasStockInconsistency).toBe(false);
      expect(sale.body.lines[0].shortfallNormalized).toBe(0);
    });

    it('broke a Carton open to find them, and says so in the stock', async () => {
      // 10 Cartons, 2 Pieces sold: one Carton is opened and 4 Pieces are loose.
      const stock = await stockOf(cokeId);

      expect(describePackages(stock.packages)).toBe('9 Carton + 4 Piece');
      expect(stock.normalizedQuantity).toBe(58);
    });

    it('attributes it to the worker and the phone it was rung up on', async () => {
      const sale = await prisma.sale.findFirst({ orderBy: { createdAt: 'asc' } });

      expect(sale?.soldById).toBe(workerId);
      expect(sale?.deviceId).toBe(deviceId);
    });

    it('stamps it with the server clock, not the device’s', async () => {
      const sale = await prisma.sale.findFirst({ orderBy: { createdAt: 'asc' } });
      const skew = Math.abs(Date.now() - (sale?.createdAt.getTime() ?? 0));

      // A phone with a wrong local time must not decide which day this lands
      // on. The row's time is the backend's, so it is within seconds of now.
      expect(skew).toBeLessThan(60_000);
    });
  });

  describe('2 — the worker types a name and picks from the suggestions', () => {
    it('matches anywhere in the name, not only at the start', async () => {
      const response = await api()
        .get('/api/v1/products')
        .query({ query: 'cola' })
        .set(authed(workerToken))
        .expect(200);

      expect(response.body.map((product: { id: string }) => product.id)).toContain(cokeId);
    });

    it('sells the found item by the Carton', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokeCartonId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 12_000 }],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(12_000);
      // No cash tendered was named, so there is nothing to hand back.
      expect(sale.body.changeTzs).toBe(0);
      expect(sale.body.payments[0].changeTzs).toBeNull();
    });

    it('took the Carton from the shelf, leaving the loose Pieces alone', async () => {
      const stock = await stockOf(cokeId);

      expect(describePackages(stock.packages)).toBe('8 Carton + 4 Piece');
      expect(stock.normalizedQuantity).toBe(52);
    });
  });

  describe('3 — the worker adds an unknown item in the middle of a sale', () => {
    let sabuniId: string;
    let sabuniPieceId: string;

    it('creates it with only what is needed to sell it now', async () => {
      // Doc 01 §5: Shoprex must not force catalogue setup before a shop can
      // sell. A name, a unit, and a price is the whole requirement.
      const created = await api()
        .post('/api/v1/products')
        .set(authed(workerToken))
        .send({ name: 'Sabuni ya Mche', units: [{ name: 'Kipande', priceTzs: 2_500 }] })
        .expect(201);

      sabuniId = created.body.id;
      sabuniPieceId = created.body.units[0].id;

      expect(created.body.units[0].priceTzs).toBe(2_500);
    });

    it('sells it immediately, without anyone receiving stock first', async () => {
      // The product was created seconds ago, so of course nothing has been
      // received against it. Refusing the sale here would be Shoprex arguing
      // with a seller who is holding the bar of soap. Negative-stock policy,
      // confirmed by the owner 2026-08-23.
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sabuniId, productUnitId: sabuniPieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 2_500 }],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(2_500);
      expect(sale.body.hasStockInconsistency).toBe(true);
      expect(sale.body.lines[0].shortfallNormalized).toBe(1);
    });

    it('takes the balance negative rather than pretending it is zero', async () => {
      expect((await stockOf(sabuniId)).normalizedQuantity).toBe(-1);
    });

    it('leaves the owner an inconsistency to act on, naming the product', async () => {
      const events = await api()
        .get('/api/v1/audit-events')
        .set(authed(ownerToken))
        .expect(200);

      const flagged = events.body.find(
        (event: { action: string; targetId: string }) =>
          event.action === 'STOCK_INCONSISTENCY' && event.targetId === sabuniId,
      );

      expect(flagged).toBeDefined();
      expect(flagged.summary).toMatch(/Sabuni ya Mche/);
      expect(flagged.summary).toMatch(/short by 1/);
    });

    it('lets a delivery settle the shortfall without anyone doing arithmetic', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({
          lines: [{ productId: sabuniId, productUnitId: sabuniPieceId, quantity: 20 }],
        })
        .expect(201);

      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sabuniId, productUnitId: sabuniPieceId, quantity: 3 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 7_500, cashReceivedTzs: 10_000 },
          ],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(7_500);
      expect(sale.body.changeTzs).toBe(2_500);
      // -1 from the sale before anything was received, +20 received, -3 sold.
      expect((await stockOf(sabuniId)).normalizedQuantity).toBe(16);
    });
  });

  describe('4 — quantities, and the same product in two units', () => {
    it('keeps 2 Cartons and 5 Pieces as two lines on one sale', async () => {
      // Doc 02 §6: the commercial unit actually sold is what the receipt
      // preserves, even though 2 Cartons and 5 Pieces could be added up.
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [
            { productId: cokeId, productUnitId: cokeCartonId, quantity: 2 },
            { productId: cokeId, productUnitId: cokePieceId, quantity: 3 },
          ],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 27_000 }],
        })
        .expect(201);

      expect(sale.body.lines).toHaveLength(2);
      expect(sale.body.totalTzs).toBe(2 * 12_000 + 3 * 1_000);
      expect(
        sale.body.lines.map((line: { unitName: string; quantity: number }) => [
          line.unitName,
          line.quantity,
        ]),
      ).toEqual([
        ['Carton', 2],
        ['Piece', 3],
      ]);
    });

    it('removed both, in their own units, leaving 6 Cartons + 1 Piece', async () => {
      // 8 Cartons + 4 Pieces, less 2 Cartons and 3 Pieces.
      const stock = await stockOf(cokeId);

      expect(describePackages(stock.packages)).toBe('6 Carton + 1 Piece');
      expect(stock.normalizedQuantity).toBe(37);
    });

    it('refuses the same product and unit twice on one sale', async () => {
      // The phone's cart is supposed to increment the line it already has. Two
      // identical lines mean it did not, and adding them up quietly would hide
      // the bug rather than surface it.
      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [
            { productId: cokeId, productUnitId: cokePieceId, quantity: 1 },
            { productId: cokeId, productUnitId: cokePieceId, quantity: 1 },
          ],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 2_000 }],
        })
        .expect(400);

      expect(response.body.message).toMatch(/appears twice/);
    });
  });

  describe('5 — cash, mixed, and debt', () => {
    it('settles a bill across cash and mobile money', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokeCartonId, quantity: 1 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 2_000, cashReceivedTzs: 2_000 },
            { paymentMethodId: mobileMethodId, amountTzs: 10_000 },
          ],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(12_000);
      expect(sale.body.payments).toHaveLength(2);
      expect(
        sale.body.payments.map((payment: { methodName: string; amountTzs: number }) => [
          payment.methodName,
          payment.amountTzs,
        ]),
      ).toEqual([
        ['Taslimu', 2_000],
        ['Pesa ya simu', 10_000],
      ]);
    });

    it('refuses a split that does not settle the bill exactly', async () => {
      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokeCartonId, quantity: 1 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 2_000 },
            { paymentMethodId: mobileMethodId, amountTzs: 5_000 },
          ],
        })
        .expect(400);

      expect(response.body.message).toMatch(/7000 settled against 12000/);
    });

    it('records a debt against a name, and nothing else', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 4 }],
          payments: [
            { paymentMethodId: debtMethodId, amountTzs: 4_000, debtorName: 'Mama Asha' },
          ],
        })
        .expect(201);

      expect(sale.body.debtTzs).toBe(4_000);
      expect(sale.body.payments[0].debtorName).toBe('Mama Asha');
      // No customer account, no history, no collection workflow — doc 01 §8.
      expect(Object.keys(sale.body)).not.toContain('customerId');
    });

    it('refuses a debt with no name', async () => {
      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: debtMethodId, amountTzs: 1_000 }],
        })
        .expect(400);

      expect(response.body.message).toMatch(/debtor name/);
    });

    it('takes part in cash and puts the rest on the slate', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 5 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 3_000, cashReceivedTzs: 3_000 },
            { paymentMethodId: debtMethodId, amountTzs: 2_000, debtorName: 'Baba Juma' },
          ],
        })
        .expect(201);

      expect(sale.body.totalTzs).toBe(5_000);
      expect(sale.body.debtTzs).toBe(2_000);
    });

    it('will not let a phone call a mobile-money payment cash to conjure change', async () => {
      // The kind comes from the method record, never from the request body, so
      // `cashReceivedTzs` on a mobile-money line is refused outright.
      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [
            { paymentMethodId: mobileMethodId, amountTzs: 1_000, cashReceivedTzs: 5_000 },
          ],
        })
        .expect(400);

      expect(response.body.message).toMatch(/Only a cash payment/);
    });

    it('refuses a payment method the owner has switched off', async () => {
      // Deactivating Deni is how an owner says their shop does not sell on
      // credit. A phone holding a stale list must not be able to override it.
      await prisma.paymentMethod.update({
        where: { id: debtMethodId },
        data: { isActive: false },
      });

      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [
            { paymentMethodId: debtMethodId, amountTzs: 1_000, debtorName: 'Mama Asha' },
          ],
        })
        .expect(404);

      expect(response.body.message).toMatch(/not available/);

      await prisma.paymentMethod.update({
        where: { id: debtMethodId },
        data: { isActive: true },
      });
    });
  });

  describe('6 — the receipt, and the next sale', () => {
    let saleId: string;

    it('shows the sale that was just rung up', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 2 }],
          payments: [
            { paymentMethodId: cashMethodId, amountTzs: 2_000, cashReceivedTzs: 2_000 },
          ],
        })
        .expect(201);

      saleId = sale.body.id;

      const receipt = await api()
        .get(`/api/v1/branches/${branchId}/sales/${saleId}`)
        .set(authed(workerToken))
        .expect(200);

      expect(receipt.body).toMatchObject({
        id: saleId,
        totalTzs: 2_000,
        soldByName: 'Juma Hassan',
      });
      expect(receipt.body.lines[0]).toMatchObject({
        productName: 'Coca-Cola 500ml',
        unitName: 'Piece',
        quantity: 2,
        unitPriceTzs: 1_000,
        lineTotalTzs: 2_000,
      });
    });

    it('still reads the same after the shop changes the price', async () => {
      // Doc 02 §6: a later price change must never rewrite a completed sale.
      await prisma.productUnit.update({
        where: { id: cokePieceId },
        data: { priceTzs: 1_500 },
      });

      const receipt = await api()
        .get(`/api/v1/branches/${branchId}/sales/${saleId}`)
        .set(authed(workerToken))
        .expect(200);

      expect(receipt.body.lines[0].unitPriceTzs).toBe(1_000);
      expect(receipt.body.totalTzs).toBe(2_000);

      await prisma.productUnit.update({
        where: { id: cokePieceId },
        data: { priceTzs: 1_000 },
      });
    });

    it('starts the next sale immediately, with no dead end in between', async () => {
      const next = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(201);

      expect(next.body.id).not.toBe(saleId);
    });

    it('traces the stock a sale removed back to the sale that caused it', async () => {
      const movement = await prisma.stockMovement.findFirst({
        where: { sourceType: 'Sale', sourceId: saleId },
      });

      expect(movement).toMatchObject({
        direction: StockDirection.OUT,
        reason: StockMovementReason.SALE,
        quantity: 2,
        actorUserId: workerId,
        deviceId,
      });
    });

    it('leaves the owner an audit line for it', async () => {
      const events = await api()
        .get('/api/v1/audit-events')
        .set(authed(ownerToken))
        .expect(200);

      expect(
        events.body.some(
          (event: { action: string; targetId: string }) =>
            event.action === 'SALE_COMPLETED' && event.targetId === saleId,
        ),
      ).toBe(true);
    });
  });

  describe('7 — a retry on a bad connection does not sell it twice', () => {
    it('returns the original sale for a repeated key', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
      };

      const first = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send(body)
        .expect(201);

      const retry = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send(body)
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.sale.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('takes the stock only once', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
      };

      const before = (await stockOf(cokeId)).normalizedQuantity;

      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send(body)
        .expect(201);
      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send(body)
        .expect(201);

      expect((await stockOf(cokeId)).normalizedQuantity).toBe(before - 1);
    });

    it('collapses two identical requests racing each other onto one sale', async () => {
      // The check-then-insert above is the cheap path; this is the one the
      // unique index has to catch, because neither request sees the other's
      // row when it looks.
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
      };

      const [a, b] = await Promise.all([
        api().post(`/api/v1/branches/${branchId}/sales`).set(authed(workerToken)).send(body),
        api().post(`/api/v1/branches/${branchId}/sales`).set(authed(workerToken)).send(body),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.sale.count({ where: { idempotencyKey: key } })).toBe(1);
    });
  });

  describe('8 — what the backend will not let a phone do', () => {
    it('refuses a seller who has had SELL taken away, at once', async () => {
      await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.VIEW_STOCK] })
        .expect(200);

      // The same token that worked a moment ago. Permissions are read from the
      // database per request, so this does not wait for the token to expire.
      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(403);

      await api()
        .patch(`/api/v1/users/${workerId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.SELL] })
        .expect(200);
    });

    it('refuses a revoked phone, whatever it still believes', async () => {
      const secondWorker = (
        await api()
          .post('/api/v1/users/workers')
          .set(authed(ownerToken))
          .send({
            fullName: 'Neema Said',
            password,
            branchId,
            permissions: [UserPermission.SELL],
          })
          .expect(201)
      ).body.id;

      const issued = await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId, deviceName: 'Simu ya pili' })
        .expect(201);

      const secondDeviceId = (
        await api().post('/api/v1/devices/enroll').send({ code: issued.body.code }).expect(200)
      ).body.deviceId;

      const token = (
        await api()
          .post('/api/v1/auth/device/login')
          .send({ deviceId: secondDeviceId, userId: secondWorker, password })
          .expect(200)
      ).body.accessToken;

      await api()
        .post(`/api/v1/devices/${secondDeviceId}/revoke`)
        .set(authed(ownerToken))
        .expect(200);

      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(token))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(401);
    });

    it('refuses a unit that has no price yet', async () => {
      const unpriced = await api()
        .post('/api/v1/products')
        .set(authed(workerToken))
        .send({ name: 'Bidhaa Isiyo na Bei', units: [{ name: 'Kipande' }] })
        .expect(201);

      const response = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [
            {
              productId: unpriced.body.id,
              productUnitId: unpriced.body.units[0].id,
              quantity: 1,
            },
          ],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(400);

      expect(response.body.message).toMatch(/no price yet/);
    });

    it('refuses a sale with no idempotency key at all', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(400);
    });

    it('refuses a request body that tries to name its own tenant', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(workerToken))
        .send({
          idempotencyKey: nextKey(),
          businessId: '00000000-0000-4000-8000-000000000000',
          lines: [{ productId: cokeId, productUnitId: cokePieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(400);
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditAction,
  PrismaClient,
  StockDirection,
  StockMovementReason,
  UserPermission,
} from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 5's acceptance check, driven end to end over HTTP as the person it is
 * written about: *a stock keeper*, signed in on a phone enrolled to a branch.
 *
 *   "A permitted user can receive known and unknown products, while users
 *    without the relevant permission are rejected by both the mobile UI and
 *    the backend."
 *
 * The mobile half is proven in `mobile/src/features/receive/`. This is the
 * backend half, and it is deliberately the same journey the Pokea mzigo screen
 * makes: find the item, add it if the shop has never carried it, say what
 * arrived and optionally what it cost, and send the whole delivery in one
 * request. `test/stock-engine.e2e-spec.ts` already proves the arithmetic
 * underneath; what is proven here is the journey, and the refusals.
 *
 * Phase 5 adds **no new route and no new table** — everything below shipped in
 * Phase 3. That is the point: the phase is a screen over a contract that
 * already existed, and this suite is what says the contract really supports it.
 */
describe('Receiving stock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A real EAN-13: the check digit is verified, so a made-up one proves nothing. */
  const barcode = '5901234123457';

  let ownerToken: string;
  /** RECEIVE_STOCK and VIEW_STOCK — the back-room phone. */
  let keeperToken: string;
  let keeperId: string;
  /** SELL only — may not receive. */
  let sellerToken: string;
  /** Nothing at all. */
  let bystanderToken: string;
  /** A stock keeper at another branch of the same shop. */
  let otherBranchKeeperToken: string;

  let branchId: string;
  let otherBranchId: string;

  let cokeId: string;
  let cartonId: string;
  let pieceId: string;

  /** Seeded with the business; a sale needs one even when it is doomed. */
  let cashMethodId: string;

  const stockOf = async (productId: string, token = ownerToken, branch = branchId) =>
    (
      await api()
        .get(`/api/v1/branches/${branch}/stock/${productId}`)
        .set(authed(token))
        .expect(200)
    ).body as {
      packages: Array<{ unitName: string; quantity: number }>;
      normalizedQuantity: number;
    };

  const describePackages = (packages: Array<{ unitName: string; quantity: number }>) =>
    packages.map((entry) => `${entry.quantity} ${entry.unitName}`).join(' + ');

  /** A worker on a phone enrolled to a branch, exactly as the app arrives. */
  const enrollWorker = async (
    fullName: string,
    permissions: UserPermission[],
    branch: string,
  ): Promise<{ token: string; userId: string }> => {
    const worker = await api()
      .post('/api/v1/users/workers')
      .set(authed(ownerToken))
      .send({ fullName, password, branchId: branch, permissions })
      .expect(201);

    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerToken))
      .send({ branchId: branch, deviceName: `Simu ya ${fullName}` })
      .expect(201);

    const enrolled = await api()
      .post('/api/v1/devices/enroll')
      .send({ code: issued.body.code })
      .expect(200);

    const session = await api()
      .post('/api/v1/auth/device/login')
      .send({ deviceId: enrolled.body.deviceId, userId: worker.body.id, password })
      .expect(200);

    return { token: session.body.accessToken, userId: worker.body.id };
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

    const signup = await api()
      .post('/api/v1/auth/signup')
      .send({
        shopName: 'Duka la Mzigo',
        email: 'owner@mzigo.co.tz',
        phone: '0716000020',
        password,
        fullName: 'Mmiliki Mzigo',
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

    otherBranchId = (
      await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Tawi la Pili' })
        .expect(201)
    ).body.id;

    const keeper = await enrollWorker(
      'Mhifadhi Mzigo',
      [UserPermission.RECEIVE_STOCK, UserPermission.VIEW_STOCK],
      branchId,
    );

    keeperToken = keeper.token;
    keeperId = keeper.userId;

    sellerToken = (await enrollWorker('Muuzaji', [UserPermission.SELL], branchId)).token;
    bystanderToken = (await enrollWorker('Mtu Tu', [], branchId)).token;
    otherBranchKeeperToken = (
      await enrollWorker(
        'Mhifadhi wa Pili',
        [UserPermission.RECEIVE_STOCK, UserPermission.VIEW_STOCK],
        otherBranchId,
      )
    ).token;

    // One product the shop already carries, with a barcode on it, so the
    // "known product" path has something real to find.
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
        barcode,
      })
      .expect(201);

    cokeId = coke.body.id;
    cartonId = coke.body.units.find((unit: { name: string }) => unit.name === 'Carton').id;
    pieceId = coke.body.units.find((unit: { name: string }) => unit.name === 'Piece').id;

    const methods = await api()
      .get('/api/v1/payment-methods')
      .set(authed(ownerToken))
      .expect(200);

    cashMethodId = methods.body.find(
      (method: { kind: string }) => method.kind === 'CASH',
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('1 — receiving a product the shop already carries', () => {
    it('finds it by the barcode on the box', async () => {
      const found = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode })
        .set(authed(keeperToken))
        .expect(200);

      expect(found.body.id).toBe(cokeId);
    });

    it('finds it by a fragment of its name, the way the search box does', async () => {
      const found = await api()
        .get('/api/v1/products')
        .query({ query: 'cola' })
        .set(authed(keeperToken))
        .expect(200);

      expect(found.body.map((product: { id: string }) => product.id)).toContain(cokeId);
    });

    it('records the delivery in the packaging it arrived in', async () => {
      const receipt = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 6 }] })
        .expect(201);

      expect(receipt.body.lines).toHaveLength(1);
      expect(receipt.body.lines[0]).toMatchObject({
        productName: 'Coca-Cola 500ml',
        unitName: 'Carton',
        quantity: 6,
        // Six Cartons, not thirty-six Pieces — the normalizing is the
        // backend's and is snapshotted here, never sent by the phone.
        normalizedQuantity: 36,
        unitCostTzs: null,
      });
      expect(receipt.body.receivedByName).toBe('Mhifadhi Mzigo');
    });

    it('shows up on the shelf as six Cartons, not as thirty-six loose Pieces', async () => {
      const stock = await stockOf(cokeId, keeperToken);

      expect(describePackages(stock.packages)).toBe('6 Carton');
      expect(stock.normalizedQuantity).toBe(36);
    });

    it('takes several packagings of one product in a single delivery', async () => {
      // 2 more Cartons and 5 loose Pieces. They stay two lines and two shelf
      // entries: nobody taped a box around the Pieces.
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          lines: [
            { productId: cokeId, productUnitId: cartonId, quantity: 2 },
            { productId: cokeId, productUnitId: pieceId, quantity: 5 },
          ],
        })
        .expect(201);

      const stock = await stockOf(cokeId, keeperToken);

      expect(describePackages(stock.packages)).toBe('8 Carton + 5 Piece');
      expect(stock.normalizedQuantity).toBe(53);
    });

    it('records what the shop paid, when the shop says', async () => {
      const receipt = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1, unitCostTzs: 9_000 }],
        })
        .expect(201);

      expect(receipt.body.lines[0].unitCostTzs).toBe(9_000);
    });

    it('stamps the delivery with the backend clock, not a value from the phone', async () => {
      const before = Date.now();

      const receipt = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          lines: [{ productId: cokeId, productUnitId: pieceId, quantity: 1 }],
          // Not part of the DTO, so `forbidNonWhitelisted` refuses it outright
          // rather than quietly ignoring it.
          createdAt: '2001-01-01T00:00:00.000Z',
        })
        .expect(400);

      expect(JSON.stringify(receipt.body.message)).toMatch(/createdAt/);

      const honest = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: pieceId, quantity: 1 }] })
        .expect(201);

      expect(new Date(honest.body.createdAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('attributes it to the person and the phone it was recorded on', async () => {
      const movement = await prisma.stockMovement.findFirstOrThrow({
        where: { productId: cokeId, direction: StockDirection.IN },
        orderBy: { createdAt: 'desc' },
      });

      expect(movement.reason).toBe(StockMovementReason.RECEIPT);
      expect(movement.actorUserId).toBe(keeperId);
      expect(movement.deviceId).not.toBeNull();

      const audit = await prisma.auditEvent.findFirst({
        where: { action: AuditAction.STOCK_RECEIVED },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit?.actorUserId).toBe(keeperId);
    });
  });

  describe('2 — receiving something the shop has never carried', () => {
    let mcheleId: string;
    let guniaId: string;

    it('lets the stock keeper add it without naming a price', async () => {
      // The Pokea mzigo screen does not ask for one: a box going onto a shelf
      // needs no selling price, and doc 01 §6 lets a product be enriched
      // later. `priceTzs` is optional on the DTO precisely for this.
      const created = await api()
        .post('/api/v1/products')
        .set(authed(keeperToken))
        .send({ name: 'Mchele wa Kyela', units: [{ name: 'Gunia' }] })
        .expect(201);

      mcheleId = created.body.id;
      guniaId = created.body.units[0].id;

      expect(created.body.units[0].priceTzs).toBeNull();
    });

    it('receives it straight away, unpriced and all', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          lines: [
            { productId: mcheleId, productUnitId: guniaId, quantity: 4, unitCostTzs: 120_000 },
          ],
        })
        .expect(201);

      const stock = await stockOf(mcheleId, keeperToken);

      expect(describePackages(stock.packages)).toBe('4 Gunia');
    });

    it('still refuses to sell it, because a sale cannot invent a price', async () => {
      // The two rules living side by side: shelving needs no price, selling
      // does. The shop is told, rather than sold something at a guess.
      const refused = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(ownerToken))
        .send({
          idempotencyKey: `e2e-unpriced-${Date.now()}`,
          lines: [{ productId: mcheleId, productUnitId: guniaId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_000 }],
        })
        .expect(400);

      expect(JSON.stringify(refused.body.message)).toMatch(/bei|price/i);
    });

    it('attaches a barcode when the new item was scanned rather than typed', async () => {
      const scanned = await api()
        .post('/api/v1/products')
        .set(authed(keeperToken))
        .send({
          name: 'Sabuni ya Mche',
          units: [{ name: 'Kipande' }],
          barcode: '4006381333931',
        })
        .expect(201);

      const found = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '4006381333931' })
        .set(authed(keeperToken))
        .expect(200);

      expect(found.body.id).toBe(scanned.body.id);
    });
  });

  describe('3 — a delivery is all or nothing', () => {
    it('leaves nothing on the shelf when one line of it is wrong', async () => {
      const before = await stockOf(cokeId, keeperToken);

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          lines: [
            { productId: cokeId, productUnitId: cartonId, quantity: 3 },
            // A unit that belongs to a different product.
            { productId: cokeId, productUnitId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
          ],
        })
        .expect(404);

      const after = await stockOf(cokeId, keeperToken);

      expect(after.normalizedQuantity).toBe(before.normalizedQuantity);
    });

    it('refuses an empty delivery', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [] })
        .expect(400);
    });

    it('refuses a quantity of nothing', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 0 }] })
        .expect(400);
    });
  });

  describe('4 — what the backend refuses, whatever the phone shows', () => {
    it('refuses a seller recording a delivery', async () => {
      // The phone hides Pokea mzigo from this person. That is a courtesy; this
      // is the authorization.
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(sellerToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(403);
    });

    it('refuses a seller reading the stock', async () => {
      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(sellerToken))
        .expect(403);
    });

    it('refuses somebody granted nothing at all', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(bystanderToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(403);

      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(bystanderToken))
        .expect(403);
    });

    it('takes RECEIVE_STOCK away mid-shift, without waiting for the token to expire', async () => {
      await api()
        .patch(`/api/v1/users/${keeperId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.VIEW_STOCK] })
        .expect(200);

      // Same token, still valid and unexpired — and now refused.
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(403);

      // Looking is still allowed, so the refusal is the permission and not the
      // session going stale.
      await api().get(`/api/v1/branches/${branchId}/stock`).set(authed(keeperToken)).expect(200);

      await api()
        .patch(`/api/v1/users/${keeperId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.RECEIVE_STOCK, UserPermission.VIEW_STOCK] })
        .expect(200);
    });

    it('hides another branch of the same shop behind a 404, not a 403', async () => {
      // The stock keeper at Tawi la Pili holds RECEIVE_STOCK, so this is not a
      // permission question — it is a branch question, and the answer must not
      // confirm that the other branch exists.
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(otherBranchKeeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(404);

      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(otherBranchKeeperToken))
        .expect(404);
    });

    it('refuses a revoked phone on its very next request', async () => {
      const { token, userId } = await enrollWorker(
        'Mhifadhi wa Muda',
        [UserPermission.RECEIVE_STOCK],
        branchId,
      );

      const device = await prisma.device.findFirstOrThrow({
        where: { branchId },
        orderBy: { createdAt: 'desc' },
      });

      await api()
        .post(`/api/v1/devices/${device.id}/revoke`)
        .set(authed(ownerToken))
        .send({})
        .expect(200);

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(token))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(401);

      expect(userId).toBeDefined();
    });
  });

  describe('5 — the stock view a person actually reads', () => {
    it('lists the branch holdings in physical packages', async () => {
      const list = await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(keeperToken))
        .expect(200);

      const coke = list.body.find(
        (entry: { productId: string }) => entry.productId === cokeId,
      );

      expect(describePackages(coke.packages)).toMatch(/Carton/);
      expect(coke.baseUnitName).toBe('Piece');
    });

    it('answers 0 for a product the branch holds none of, rather than 404', async () => {
      // "We have none" is a real answer while unpacking; a 404 would read as
      // "no such product".
      const fresh = await api()
        .post('/api/v1/products')
        .set(authed(keeperToken))
        .send({ name: 'Bidhaa Isiyopokelewa', units: [{ name: 'Kipande' }] })
        .expect(201);

      const stock = await stockOf(fresh.body.id, keeperToken);

      expect(stock.normalizedQuantity).toBe(0);
      expect(stock.packages).toEqual([]);
    });

    it('shows a negative balance rather than filtering it out of the list', async () => {
      // Doc 02 §5's negative-stock policy. A shop that sold more than it
      // recorded receiving needs to see the deficit in the very list it would
      // open to find it — and a later delivery settles it with no arithmetic
      // by hand.
      const short = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Bidhaa Pungufu', units: [{ name: 'Kipande', priceTzs: 500 }] })
        .expect(201);

      const unitId = short.body.units[0].id;

      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(ownerToken))
        .send({
          idempotencyKey: `e2e-short-${Date.now()}`,
          lines: [{ productId: short.body.id, productUnitId: unitId, quantity: 3 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500 }],
        })
        .expect(201);

      const list = await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(keeperToken))
        .expect(200);

      const negative = list.body.find(
        (entry: { productId: string }) => entry.productId === short.body.id,
      );

      expect(negative.normalizedQuantity).toBe(-3);
      expect(describePackages(negative.packages)).toBe('-3 Kipande');

      // And receiving 10 lands on the true 7.
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: short.body.id, productUnitId: unitId, quantity: 10 }] })
        .expect(201);

      expect((await stockOf(short.body.id, keeperToken)).normalizedQuantity).toBe(7);
    });
  });
  /**
   * Phase 8 — a delivery retried on a bad connection.
   *
   * The network a pilot shop runs on drops responses, not requests: the crate
   * is already on the shelf and the phone never hears so. Until Phase 8 this
   * route carried no idempotency key at all, so a stock keeper who pressed
   * Hifadhi again received the whole lorry a second time — and there is no way
   * in V1 to correct a saved delivery.
   */
  describe('6 — a retry on a bad connection does not receive it twice', () => {
    const nextKey = (() => {
      let n = 0;

      return () => `receive-retry-${(n += 1)}-${Date.now()}`;
    })();

    const delivery = (idempotencyKey: string, quantity = 3) => ({
      idempotencyKey,
      lines: [{ productId: cokeId, productUnitId: cartonId, quantity }],
    });

    it('returns the original receipt for a repeated key', async () => {
      const key = nextKey();

      const first = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      const retry = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.stockReceipt.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('puts the stock on the shelf exactly once', async () => {
      const key = nextKey();
      const before = (await stockOf(cokeId)).normalizedQuantity;

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      // Three Cartons of six, once — not twice.
      expect((await stockOf(cokeId)).normalizedQuantity).toBe(before + 18);
    });

    it('writes one stock movement and one audit line, not two', async () => {
      const key = nextKey();

      const first = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      expect(
        await prisma.stockMovement.count({
          where: { sourceType: 'StockReceipt', sourceId: first.body.id },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'STOCK_RECEIVED', targetId: first.body.id },
        }),
      ).toBe(1);
    });

    it('collapses two identical deliveries racing each other onto one receipt', async () => {
      // The check-then-insert above is the cheap path. This is the one the
      // unique index has to catch, because neither request sees the other's
      // row when it looks.
      const key = nextKey();
      const before = (await stockOf(cokeId)).normalizedQuantity;

      const [a, b] = await Promise.all([
        api()
          .post(`/api/v1/branches/${branchId}/stock-receipts`)
          .set(authed(keeperToken))
          .send(delivery(key)),
        api()
          .post(`/api/v1/branches/${branchId}/stock-receipts`)
          .set(authed(keeperToken))
          .send(delivery(key)),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.stockReceipt.count({ where: { idempotencyKey: key } })).toBe(1);
      expect((await stockOf(cokeId)).normalizedQuantity).toBe(before + 18);
    });

    it('refuses a key already used in another branch rather than answering with it', async () => {
      const key = nextKey();

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(delivery(key))
        .expect(201);

      // Answering with the first branch's receipt would quietly tell this
      // person that goods reached a shelf they are not standing at.
      await api()
        .post(`/api/v1/branches/${otherBranchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send(delivery(key))
        .expect(409);
    });

    it('still records a delivery sent without a key at all', async () => {
      // The column is nullable on purpose: PostgreSQL treats NULLs as distinct
      // in a unique index, so a client written before Phase 8 keeps working
      // and two keyless deliveries never collide with each other.
      const before = (await stockOf(cokeId)).normalizedQuantity;

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(201);
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 1 }] })
        .expect(201);

      expect((await stockOf(cokeId)).normalizedQuantity).toBe(before + 12);
    });
  });
});

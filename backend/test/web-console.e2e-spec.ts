import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditAction,
  PaymentMethodKind,
  PrismaClient,
  UserPermission,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 6's acceptance check, driven end to end over HTTP by the four people
 * the console is built for:
 *
 *   "Platform administrators can manage shop accounts; owners can manage only
 *    their businesses; delegated managers see only authorized branches; web
 *    actions use the NestJS API rather than direct database access; the
 *    worker/manager/device flows built API-only in Phase 2 now have a working
 *    screen."
 *
 * This is the backend half. It follows §5's template — it calls only the
 * routes the console calls, in the order the console calls them — so it says
 * something a route-by-route unit test cannot: that the contract actually
 * supports the journey. The screens themselves are proven in `web/`.
 *
 * The last clause is the one worth naming. "Web actions use the NestJS API
 * rather than direct database access" cannot be proven by an e2e test at all,
 * because a test that talked to the database directly would be indistinguishable
 * from the app doing so. It is proven structurally instead: `web/` has no
 * `DATABASE_URL`, no Prisma dependency, and one module — `web/src/lib/api/` —
 * through which every read and write goes.
 */
describe('Owner and admin web console (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  const adminEmail = 'e2e-admin@console.co.tz';
  const barcode = '5901234123457';
  /** A second real EAN-13, for the attach-to-an-existing-product path. */
  const laterBarcode = '4006381333931';

  let adminToken: string;

  /** Shop one: the console's own tenant. */
  let ownerToken: string;
  let branchId: string;
  let otherBranchId: string;
  let managerToken: string;
  let managerId: string;
  let sellerToken: string;
  let sellerId: string;

  /** Shop two: everything shop one must never see. */
  let strangerOwnerToken: string;
  let strangerBusinessId: string;
  let strangerBranchId: string;
  let strangerProductId: string;
  let strangerMethodId: string;

  let cokeId: string;
  let cartonId: string;
  let pieceId: string;
  let cashMethodId: string;
  let debtMethodId: string;

  /** A worker on a phone enrolled to a branch, exactly as the app arrives. */
  const enrollWorker = async (
    token: string,
    fullName: string,
    permissions: UserPermission[],
    branch: string,
  ): Promise<{ token: string; userId: string; deviceId: string }> => {
    const worker = await api()
      .post('/api/v1/users/workers')
      .set(authed(token))
      .send({ fullName, password, branchId: branch, permissions })
      .expect(201);

    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(token))
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

    return {
      token: session.body.accessToken,
      userId: worker.body.id,
      deviceId: enrolled.body.deviceId,
    };
  };

  const sell = (
    token: string,
    branch: string,
    lines: Array<{ productId: string; productUnitId: string; quantity: number }>,
    total: number,
  ) =>
    api()
      .post(`/api/v1/branches/${branch}/sales`)
      .set(authed(token))
      .send({
        idempotencyKey: `console-${Math.random().toString(36).slice(2)}`,
        lines,
        payments: [
          { paymentMethodId: cashMethodId, amountTzs: total, cashReceivedTzs: total },
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

    // No route creates a platform administrator, by design — they are not
    // self-service. Seeded straight into the database, the way the real one is.
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'E2E Platform Admin',
        role: UserRole.PLATFORM_ADMIN,
      },
    });

    adminToken = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password })
        .expect(200)
    ).body.accessToken;

    // Shop two first, so shop one is never the only thing in the database and
    // an isolation test that passed vacuously would show up.
    const stranger = await api()
      .post('/api/v1/auth/signup')
      .send({
        shopName: 'Duka la Jirani',
        email: 'owner@jirani.co.tz',
        phone: '0716000041',
        password,
        fullName: 'Mmiliki Jirani',
      })
      .expect(201);

    strangerOwnerToken = stranger.body.accessToken;
    strangerBusinessId = stranger.body.user.businessId;

    strangerBranchId = (
      await api()
        .post('/api/v1/branches')
        .set(authed(strangerOwnerToken))
        .send({ name: 'Tawi la Jirani' })
        .expect(201)
    ).body.id;

    strangerProductId = (
      await api()
        .post('/api/v1/products')
        .set(authed(strangerOwnerToken))
        .send({ name: 'Sukari 1kg', units: [{ name: 'Paketi', priceTzs: 3_000 }] })
        .expect(201)
    ).body.id;

    strangerMethodId = (
      await api()
        .get('/api/v1/payment-methods')
        .set(authed(strangerOwnerToken))
        .expect(200)
    ).body[0].id;

    const owner = await api()
      .post('/api/v1/auth/signup')
      .send({
        shopName: 'Duka la Console',
        email: 'owner@console.co.tz',
        phone: '0716000040',
        password,
        fullName: 'Mmiliki Console',
      })
      .expect(201);

    ownerToken = owner.body.accessToken;

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

    const methods = (
      await api().get('/api/v1/payment-methods').set(authed(ownerToken)).expect(200)
    ).body as Array<{ id: string; kind: PaymentMethodKind }>;

    cashMethodId = methods.find((method) => method.kind === PaymentMethodKind.CASH)!.id;
    debtMethodId = methods.find((method) => method.kind === PaymentMethodKind.DEBT)!.id;

    // A manager scoped to one branch of two — the whole point of the role.
    const manager = await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerToken))
      .send({
        fullName: 'Meneja Console',
        email: 'manager@console.co.tz',
        password,
        branchIds: [branchId],
        permissions: [
          UserPermission.VIEW_STOCK,
          UserPermission.VIEW_REPORTS,
          UserPermission.RECEIVE_STOCK,
        ],
      })
      .expect(201);

    managerId = manager.body.id;

    managerToken = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'manager@console.co.tz', password })
        .expect(200)
    ).body.accessToken;

    const seller = await enrollWorker(
      ownerToken,
      'Muuzaji Console',
      [UserPermission.SELL],
      branchId,
    );

    sellerToken = seller.token;
    sellerId = seller.userId;

    // Something on the shelf, so the sales list and the stock overview have
    // real rows rather than empty states pretending to be passes.
    await api()
      .post(`/api/v1/branches/${branchId}/stock-receipts`)
      .set(authed(ownerToken))
      .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 10 }] })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------
  // 1. Platform administrators can manage shop accounts.
  // -------------------------------------------------------------------------
  describe('the platform administrator manages shop accounts', () => {
    let onboardedBusinessId: string;

    it('onboards a shop and its first owner in one action', async () => {
      const response = await api()
        .post('/api/v1/businesses')
        .set(authed(adminToken))
        .send({
          name: 'Duka la Kuanzishwa',
          ownerFullName: 'Mmiliki Mpya',
          ownerEmail: 'mpya@kuanzishwa.co.tz',
          ownerPassword: password,
        })
        .expect(201);

      onboardedBusinessId = response.body.id;

      expect(response.body.name).toBe('Duka la Kuanzishwa');
      expect(response.body.isActive).toBe(true);

      // The owner it created can actually sign in — an onboarding that
      // produces an account nobody can use is not onboarding.
      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'mpya@kuanzishwa.co.tz', password })
        .expect(200);

      expect(session.body.user.console).toBe('owner');
      expect(session.body.user.businessName).toBe('Duka la Kuanzishwa');
    });

    it('sees every shop on the platform, with its branch and user counts', async () => {
      const response = await api()
        .get('/api/v1/businesses')
        .set(authed(adminToken))
        .expect(200);

      const names = (response.body as Array<{ name: string }>).map((shop) => shop.name);

      expect(names).toEqual(
        expect.arrayContaining(['Duka la Console', 'Duka la Jirani', 'Duka la Kuanzishwa']),
      );

      const console_ = (response.body as Array<{ name: string; branchCount: number }>).find(
        (shop) => shop.name === 'Duka la Console',
      );

      expect(console_?.branchCount).toBe(2);
    });

    it('suspends a shop account, and says so rather than half-succeeding', async () => {
      const response = await api()
        .patch(`/api/v1/businesses/${onboardedBusinessId}`)
        .set(authed(adminToken))
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('refuses a suspended shop at sign-in', async () => {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'mpya@kuanzishwa.co.tz', password })
        .expect(401);
    });

    it('refuses a token that was issued before the suspension, on its very next request', async () => {
      // The whole point. An account that is suspended everywhere except in the
      // sessions already open is not suspended, and an eight-hour token is a
      // long time to leave a door open.
      const before = await api()
        .post('/api/v1/auth/signup')
        .send({
          shopName: 'Duka la Muda',
          email: 'owner@muda.co.tz',
          phone: '0716000042',
          password,
          fullName: 'Mmiliki Muda',
        })
        .expect(201);

      const token = before.body.accessToken;

      // Works now.
      await api().get('/api/v1/businesses/me').set(authed(token)).expect(200);

      await api()
        .patch(`/api/v1/businesses/${before.body.user.businessId}`)
        .set(authed(adminToken))
        .send({ isActive: false })
        .expect(200);

      // Dead now — same token, unexpired, one request later. 403 rather than
      // 401: the credentials are perfectly good, and telling them to sign in
      // again would send them round a loop ending in the same place.
      await api().get('/api/v1/businesses/me').set(authed(token)).expect(403);
    });

    it('restores a shop whole, with nothing deleted along the way', async () => {
      await api()
        .patch(`/api/v1/businesses/${onboardedBusinessId}`)
        .set(authed(adminToken))
        .send({ isActive: true })
        .expect(200);

      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'mpya@kuanzishwa.co.tz', password })
        .expect(200);

      // Its seeded payment methods are still there: suspension locked a door,
      // it did not demolish the shop.
      const methods = await api()
        .get('/api/v1/payment-methods')
        .set(authed(session.body.accessToken))
        .expect(200);

      expect(methods.body).toHaveLength(3);
    });

    it('says when a shop is already in the state asked for', async () => {
      await api()
        .patch(`/api/v1/businesses/${onboardedBusinessId}`)
        .set(authed(adminToken))
        .send({ isActive: true })
        .expect(409);
    });

    it('refuses an owner suspending anybody, including themselves', async () => {
      await api()
        .patch(`/api/v1/businesses/${strangerBusinessId}`)
        .set(authed(ownerToken))
        .send({ isActive: false })
        .expect(403);

      await api()
        .patch(`/api/v1/businesses/${strangerBusinessId}`)
        .set(authed(strangerOwnerToken))
        .send({ isActive: false })
        .expect(403);
    });

    it('refuses an owner the platform-wide shop list', async () => {
      await api().get('/api/v1/businesses').set(authed(ownerToken)).expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Owners manage only their own business.
  // -------------------------------------------------------------------------
  describe('an owner reaches their own shop and no other', () => {
    it('scopes the business to the token, with no id to tamper with', async () => {
      const response = await api()
        .get('/api/v1/businesses/me')
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.name).toBe('Duka la Console');
      expect(response.body.branches).toHaveLength(2);
    });

    it('answers 404, not 403, for another shop’s product, method, branch, and sale', async () => {
      // 404 throughout: a caller must not learn that an id exists elsewhere.
      await api()
        .get(`/api/v1/products/${strangerProductId}`)
        .set(authed(ownerToken))
        .expect(404);

      await api()
        .patch(`/api/v1/products/${strangerProductId}`)
        .set(authed(ownerToken))
        .send({ name: 'Sukari yangu sasa' })
        .expect(404);

      await api()
        .patch(`/api/v1/payment-methods/${strangerMethodId}`)
        .set(authed(ownerToken))
        .send({ isActive: false })
        .expect(404);

      await api()
        .get(`/api/v1/branches/${strangerBranchId}/sales`)
        .set(authed(ownerToken))
        .expect(404);
    });

    it('leaves the other shop untouched by all of that', async () => {
      const product = await api()
        .get(`/api/v1/products/${strangerProductId}`)
        .set(authed(strangerOwnerToken))
        .expect(200);

      expect(product.body.name).toBe('Sukari 1kg');

      const methods = await api()
        .get('/api/v1/payment-methods')
        .set(authed(strangerOwnerToken))
        .expect(200);

      expect(methods.body).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The Phase 2 flows that had no screen: staff and devices.
  // -------------------------------------------------------------------------
  describe('the staff and device screens have a contract to sit on', () => {
    it('lists the staff an owner may manage, and never their own owner row', async () => {
      const response = await api().get('/api/v1/users').set(authed(ownerToken)).expect(200);

      const names = (response.body as Array<{ fullName: string }>).map(
        (person) => person.fullName,
      );

      expect(names).toEqual(
        expect.arrayContaining(['Meneja Console', 'Muuzaji Console']),
      );
      expect(names).not.toContain('Mmiliki Console');
    });

    it('changes what a person may do, and the change bites immediately', async () => {
      // The seller has SELL and nothing else, so the stock screen is shut.
      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(sellerToken))
        .expect(403);

      await api()
        .patch(`/api/v1/users/${sellerId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.SELL, UserPermission.VIEW_STOCK] })
        .expect(200);

      // Same token, no re-login: permissions are read from the database per
      // request, not carried in the token.
      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(sellerToken))
        .expect(200);

      await api()
        .patch(`/api/v1/users/${sellerId}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [UserPermission.SELL] })
        .expect(200);

      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(sellerToken))
        .expect(403);
    });

    it('issues an enrollment code once, and never echoes it back afterwards', async () => {
      const issued = await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId, deviceName: 'Simu ya kaunta' })
        .expect(201);

      expect(issued.body.code).toEqual(expect.any(String));

      const enrolled = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issued.body.code })
        .expect(200);

      const devices = await api().get('/api/v1/devices').set(authed(ownerToken)).expect(200);

      const listed = (devices.body as Array<{ id: string; name: string }>).find(
        (device) => device.id === enrolled.body.deviceId,
      );

      expect(listed?.name).toBe('Simu ya kaunta');
      expect(JSON.stringify(devices.body)).not.toContain(issued.body.code);
    });

    it('revokes a device from the console, and the phone dies on its next request', async () => {
      const phone = await enrollWorker(
        ownerToken,
        'Muuzaji wa Kufutwa',
        [UserPermission.SELL],
        branchId,
      );

      await api().get('/api/v1/auth/me').set(authed(phone.token)).expect(200);

      await api()
        .post(`/api/v1/devices/${phone.deviceId}/revoke`)
        .set(authed(ownerToken))
        .expect(200);

      await api().get('/api/v1/auth/me').set(authed(phone.token)).expect(401);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Product management — the routes Phase 3 deferred to this console.
  // -------------------------------------------------------------------------
  describe('product management', () => {
    it('changes a price without touching what a completed sale says', async () => {
      const sale = await sell(
        sellerToken,
        branchId,
        [{ productId: cokeId, productUnitId: pieceId, quantity: 2 }],
        2_000,
      ).expect(201);

      await api()
        .patch(`/api/v1/products/${cokeId}/units/${pieceId}`)
        .set(authed(ownerToken))
        .send({ priceTzs: 1_500 })
        .expect(200);

      // The catalogue charges the new price from now on...
      const product = await api()
        .get(`/api/v1/products/${cokeId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(
        product.body.units.find((unit: { id: string }) => unit.id === pieceId).priceTzs,
      ).toBe(1_500);

      // ...and yesterday's receipt still reads the way the customer saw it.
      const receipt = await api()
        .get(`/api/v1/branches/${branchId}/sales/${sale.body.id}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(receipt.body.lines[0].unitPriceTzs).toBe(1_000);
      expect(receipt.body.totalTzs).toBe(2_000);
    });

    it('records the old price alongside the new one in the audit log', async () => {
      const events = await api()
        .get('/api/v1/audit-events')
        .set(authed(ownerToken))
        .expect(200);

      const priced = (events.body as Array<{ action: string; summary: string }>).find(
        (event) => event.action === AuditAction.PRODUCT_PRICE_CHANGED,
      );

      // "Why is a piece 1,500 now?" is asked weeks later, and the sale lines
      // hold what was charged, not when somebody changed the number.
      expect(priced?.summary).toContain('1000');
      expect(priced?.summary).toContain('1500');
    });

    it('attaches a barcode to a product that was typed in without one', async () => {
      const typed = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Mchele wa Kyela', units: [{ name: 'Gunia', priceTzs: 90_000 }] })
        .expect(201);

      // Before: no code, so nothing to scan.
      await api()
        .get(`/api/v1/products/lookup?barcode=${laterBarcode}`)
        .set(authed(ownerToken))
        .expect(404);

      await api()
        .post(`/api/v1/products/${typed.body.id}/barcodes`)
        .set(authed(ownerToken))
        .send({ barcode: laterBarcode })
        .expect(201);

      const found = await api()
        .get(`/api/v1/products/lookup?barcode=${laterBarcode}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(found.body.id).toBe(typed.body.id);
    });

    it('refuses a barcode that fails its check digit, rather than storing a phantom', async () => {
      await api()
        .post(`/api/v1/products/${cokeId}/barcodes`)
        .set(authed(ownerToken))
        .send({ barcode: '5901234123458' })
        .expect(400);
    });

    it('refuses a barcode that already belongs to another product here', async () => {
      await api()
        .post(`/api/v1/products/${cokeId}/barcodes`)
        .set(authed(ownerToken))
        .send({ barcode: laterBarcode })
        .expect(409);
    });

    it('lets the shop next door keep the same barcode, because two shops stock the same item', async () => {
      await api()
        .post(`/api/v1/products/${strangerProductId}/barcodes`)
        .set(authed(strangerOwnerToken))
        .send({ barcode: laterBarcode })
        .expect(201);
    });

    it('discontinues a product without deleting it, and stops it being sold or received', async () => {
      const dropped = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Bidhaa ya Kusitishwa', units: [{ name: 'Kipande', priceTzs: 500 }] })
        .expect(201);

      const unitId = dropped.body.units[0].id;

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({ lines: [{ productId: dropped.body.id, productUnitId: unitId, quantity: 4 }] })
        .expect(201);

      await api()
        .patch(`/api/v1/products/${dropped.body.id}`)
        .set(authed(ownerToken))
        .send({ isActive: false })
        .expect(200);

      // Not a dead button: both write paths refuse it at the backend.
      await sell(
        sellerToken,
        branchId,
        [{ productId: dropped.body.id, productUnitId: unitId, quantity: 1 }],
        500,
      ).expect(409);

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({ lines: [{ productId: dropped.body.id, productUnitId: unitId, quantity: 1 }] })
        .expect(409);

      // It leaves the search suggestions...
      const search = await api()
        .get('/api/v1/products?query=Kusitishwa')
        .set(authed(ownerToken))
        .expect(200);

      expect(search.body).toHaveLength(0);

      // ...but the four on the shelf are still there to be counted, and the
      // product itself is still readable. Discontinued is not deleted.
      const stock = await api()
        .get(`/api/v1/branches/${branchId}/stock/${dropped.body.id}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(stock.body.normalizedQuantity).toBe(4);

      await api()
        .patch(`/api/v1/products/${dropped.body.id}`)
        .set(authed(ownerToken))
        .send({ isActive: true })
        .expect(200);

      await sell(
        sellerToken,
        branchId,
        [{ productId: dropped.body.id, productUnitId: unitId, quantity: 1 }],
        500,
      ).expect(201);
    });

    it('refuses a PATCH that changes nothing, rather than pretending it worked', async () => {
      await api()
        .patch(`/api/v1/products/${cokeId}`)
        .set(authed(ownerToken))
        .send({})
        .expect(400);
    });

    it('keeps product management away from a seller and a manager alike', async () => {
      await api()
        .patch(`/api/v1/products/${cokeId}/units/${pieceId}`)
        .set(authed(sellerToken))
        .send({ priceTzs: 10 })
        .expect(403);

      // A manager runs a branch; what the shop charges is business-wide, and
      // the owner remains the primary business decision-maker (doc 01 §3).
      await api()
        .patch(`/api/v1/products/${cokeId}/units/${pieceId}`)
        .set(authed(managerToken))
        .send({ priceTzs: 10 })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Payment-method settings — the named Phase 6 deliverable.
  // -------------------------------------------------------------------------
  describe('payment-method settings', () => {
    let mpesaId: string;

    it('adds a method, at the end of the sheet rather than in front of cash', async () => {
      const response = await api()
        .post('/api/v1/payment-methods')
        .set(authed(ownerToken))
        .send({ name: 'M-Pesa', kind: PaymentMethodKind.MOBILE_MONEY })
        .expect(201);

      mpesaId = response.body.id;

      expect(response.body.sortOrder).toBe(3);
      expect(response.body.isActive).toBe(true);
    });

    it('refuses a second method with the same name', async () => {
      await api()
        .post('/api/v1/payment-methods')
        .set(authed(ownerToken))
        .send({ name: 'm-pesa', kind: PaymentMethodKind.MOBILE_MONEY })
        .expect(409);
    });

    it('switching Deni off stops a debt sale at the backend, not just the button', async () => {
      await api()
        .patch(`/api/v1/payment-methods/${debtMethodId}`)
        .set(authed(ownerToken))
        .send({ isActive: false })
        .expect(200);

      // A phone holding the old list still has the id. It is refused anyway.
      await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: `deni-${Date.now()}`,
          lines: [{ productId: cokeId, productUnitId: pieceId, quantity: 1 }],
          payments: [
            { paymentMethodId: debtMethodId, amountTzs: 1_500, debtorName: 'Mteja' },
          ],
        })
        .expect(404);
    });

    it('hides a switched-off method from checkout but not from the settings screen', async () => {
      const checkout = await api()
        .get('/api/v1/payment-methods')
        .set(authed(sellerToken))
        .expect(200);

      expect(
        (checkout.body as Array<{ name: string }>).map((method) => method.name),
      ).not.toContain('Deni');

      const settings = await api()
        .get('/api/v1/payment-methods?includeInactive=true')
        .set(authed(ownerToken))
        .expect(200);

      const deni = (settings.body as Array<{ name: string; isActive: boolean }>).find(
        (method) => method.name === 'Deni',
      );

      // A settings screen that cannot see it is one that cannot switch it back
      // on, which is how a shop ends up stuck.
      expect(deni?.isActive).toBe(false);
    });

    it('refuses anyone but the owner the switched-off list', async () => {
      // Not "quietly gives them the active one": a client that believes it is
      // seeing everything and is not would be worse than an error.
      await api()
        .get('/api/v1/payment-methods?includeInactive=true')
        .set(authed(managerToken))
        .expect(403);

      await api()
        .get('/api/v1/payment-methods?includeInactive=true')
        .set(authed(sellerToken))
        .expect(403);
    });

    it('switches Deni back on and credit sales work again', async () => {
      await api()
        .patch(`/api/v1/payment-methods/${debtMethodId}`)
        .set(authed(ownerToken))
        .send({ isActive: true })
        .expect(200);

      const sale = await api()
        .post(`/api/v1/branches/${branchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: `deni-on-${Date.now()}`,
          lines: [{ productId: cokeId, productUnitId: pieceId, quantity: 1 }],
          payments: [
            { paymentMethodId: debtMethodId, amountTzs: 1_500, debtorName: 'Mteja Mzuri' },
          ],
        })
        .expect(201);

      expect(sale.body.debtTzs).toBe(1_500);
    });

    it('renames a method without rewriting the receipts it already settled', async () => {
      const before = await api()
        .get(`/api/v1/branches/${branchId}/sales`)
        .set(authed(ownerToken))
        .expect(200);

      const settledAsTaslimu = (
        before.body.sales as Array<{ id: string; paymentMethods: string[] }>
      ).find((sale) => sale.paymentMethods.includes('Taslimu'));

      expect(settledAsTaslimu).toBeDefined();

      await api()
        .patch(`/api/v1/payment-methods/${cashMethodId}`)
        .set(authed(ownerToken))
        .send({ name: 'Pesa Taslimu' })
        .expect(200);

      const receipt = await api()
        .get(`/api/v1/branches/${branchId}/sales/${settledAsTaslimu!.id}`)
        .set(authed(ownerToken))
        .expect(200);

      // The name was snapshotted when it settled. Renaming is safe for exactly
      // the same reason a price edit is.
      expect(receipt.body.payments[0].methodName).toBe('Taslimu');

      await api()
        .patch(`/api/v1/payment-methods/${cashMethodId}`)
        .set(authed(ownerToken))
        .send({ name: 'Taslimu' })
        .expect(200);
    });

    it('records who changed a payment method, in words the owner can search', async () => {
      const events = await api()
        .get('/api/v1/audit-events')
        .set(authed(ownerToken))
        .expect(200);

      const summaries = (events.body as Array<{ action: string; summary: string }>)
        .filter((event) => event.action === AuditAction.PAYMENT_METHOD_UPDATED)
        .map((event) => event.summary);

      expect(summaries.join(' ')).toContain('imezimwa');
    });

    it('keeps payment settings away from a manager and a seller', async () => {
      await api()
        .post('/api/v1/payment-methods')
        .set(authed(managerToken))
        .send({ name: 'Benki', kind: PaymentMethodKind.BANK })
        .expect(403);

      await api()
        .patch(`/api/v1/payment-methods/${mpesaId}`)
        .set(authed(sellerToken))
        .send({ isActive: false })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // 6. The sales list — Phase 4 shipped only the receipt.
  // -------------------------------------------------------------------------
  describe('the sales list', () => {
    it('returns a branch’s sales newest first, as summaries rather than whole sales', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/sales`)
        .set(authed(ownerToken))
        .expect(200);

      const sales = response.body.sales as Array<{
        id: string;
        createdAt: string;
        lineCount: number;
        paymentMethods: string[];
      }>;

      expect(sales.length).toBeGreaterThan(0);

      const times = sales.map((sale) => Date.parse(sale.createdAt));

      expect([...times].sort((a, b) => b - a)).toEqual(times);

      // A summary, not a receipt: no lines and no payments ride along.
      expect(sales[0]).not.toHaveProperty('lines');
      expect(sales[0]).not.toHaveProperty('payments');
      expect(sales[0].lineCount).toBeGreaterThan(0);
    });

    it('pages by cursor, so a shop selling while somebody reads never doubles a row', async () => {
      const first = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=2`)
        .set(authed(ownerToken))
        .expect(200);

      expect(first.body.sales).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=2&cursor=${first.body.nextCursor}`)
        .set(authed(ownerToken))
        .expect(200);

      const firstIds = (first.body.sales as Array<{ id: string }>).map((sale) => sale.id);
      const secondIds = (second.body.sales as Array<{ id: string }>).map((sale) => sale.id);

      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    });

    it('says null for the cursor when there is no next page', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=100`)
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.nextCursor).toBeNull();
    });

    it('refuses a cursor that is not a sale in this branch', async () => {
      const elsewhere = await api()
        .get(`/api/v1/branches/${otherBranchId}/sales`)
        .set(authed(ownerToken))
        .expect(200);

      expect(elsewhere.body.sales).toHaveLength(0);

      const here = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=1`)
        .set(authed(ownerToken))
        .expect(200);

      // The same sale id, asked for from the wrong branch: not found, rather
      // than silently paging from the top of that branch instead.
      await api()
        .get(`/api/v1/branches/${otherBranchId}/sales?cursor=${here.body.sales[0].id}`)
        .set(authed(ownerToken))
        .expect(404);
    });

    it('needs VIEW_REPORTS — the receipt does not, the list does', async () => {
      // The seller who rang a sale up may read it back...
      const mine = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=1`)
        .set(authed(ownerToken))
        .expect(200);

      await api()
        .get(`/api/v1/branches/${branchId}/sales/${mine.body.sales[0].id}`)
        .set(authed(sellerToken))
        .expect(200);

      // ...and may not browse what the shop has taken all day.
      await api()
        .get(`/api/v1/branches/${branchId}/sales`)
        .set(authed(sellerToken))
        .expect(403);
    });

    it('refuses a limit outside the range rather than clamping it silently', async () => {
      await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=500`)
        .set(authed(ownerToken))
        .expect(400);

      await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=0`)
        .set(authed(ownerToken))
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Delegated managers see only authorized branches.
  // -------------------------------------------------------------------------
  describe('a delegated manager sees only their own branches', () => {
    it('lists only the branches they are assigned to', async () => {
      const response = await api()
        .get('/api/v1/branches')
        .set(authed(managerToken))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(branchId);
    });

    it('reads the stock and the sales of their own branch', async () => {
      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(managerToken))
        .expect(200);

      const sales = await api()
        .get(`/api/v1/branches/${branchId}/sales`)
        .set(authed(managerToken))
        .expect(200);

      expect(sales.body.sales.length).toBeGreaterThan(0);
    });

    it('answers 404 for a branch of their own shop they were not given', async () => {
      // 404 inside their own tenant, not 403: the rule is the same whether the
      // branch belongs to somebody else or merely to somebody else's manager.
      await api()
        .get(`/api/v1/branches/${otherBranchId}`)
        .set(authed(managerToken))
        .expect(404);

      await api()
        .get(`/api/v1/branches/${otherBranchId}/stock`)
        .set(authed(managerToken))
        .expect(404);

      await api()
        .get(`/api/v1/branches/${otherBranchId}/sales`)
        .set(authed(managerToken))
        .expect(404);
    });

    it('sees only the staff of their own branches', async () => {
      const elsewhere = await enrollWorker(
        ownerToken,
        'Muuzaji wa Pili',
        [UserPermission.SELL],
        otherBranchId,
      );

      const response = await api().get('/api/v1/users').set(authed(managerToken)).expect(200);

      const ids = (response.body as Array<{ id: string }>).map((person) => person.id);

      expect(ids).toContain(sellerId);
      expect(ids).not.toContain(elsewhere.userId);
    });

    it('is refused every owner-only action the console offers', async () => {
      await api()
        .post('/api/v1/branches')
        .set(authed(managerToken))
        .send({ name: 'Tawi la Meneja' })
        .expect(403);

      await api()
        .post('/api/v1/users/workers')
        .set(authed(managerToken))
        .send({ fullName: 'Mfanyakazi', password, branchId, permissions: [] })
        .expect(403);

      await api()
        .patch(`/api/v1/users/${sellerId}/permissions`)
        .set(authed(managerToken))
        .send({ permissions: [] })
        .expect(403);

      await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(managerToken))
        .send({ branchId, deviceName: 'Simu ya meneja' })
        .expect(403);

      await api().get('/api/v1/audit-events').set(authed(managerToken)).expect(403);
    });

    it('is not offered the platform-admin area at all', async () => {
      await api().get('/api/v1/businesses').set(authed(managerToken)).expect(403);
      await api()
        .patch(`/api/v1/businesses/${strangerBusinessId}`)
        .set(authed(managerToken))
        .send({ isActive: false })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Tenant isolation for what this phase made writable.
  // -------------------------------------------------------------------------
  describe('tenant isolation on the resources Phase 6 made writable', () => {
    it('keeps one shop’s payment methods out of the other’s list entirely', async () => {
      const mine = await api()
        .get('/api/v1/payment-methods?includeInactive=true')
        .set(authed(ownerToken))
        .expect(200);

      const theirs = await api()
        .get('/api/v1/payment-methods?includeInactive=true')
        .set(authed(strangerOwnerToken))
        .expect(200);

      const mineIds = (mine.body as Array<{ id: string }>).map((method) => method.id);
      const theirIds = (theirs.body as Array<{ id: string }>).map((method) => method.id);

      expect(mineIds.filter((id) => theirIds.includes(id))).toEqual([]);
      expect(mineIds).toContain(cashMethodId);
      expect(theirIds).not.toContain(cashMethodId);
    });

    it('refuses to attach a barcode to another shop’s product', async () => {
      await api()
        .post(`/api/v1/products/${strangerProductId}/barcodes`)
        .set(authed(ownerToken))
        .send({ barcode: '8712100845000' })
        .expect(404);
    });

    it('refuses to reprice a unit that is not this product’s', async () => {
      const theirUnit = (
        await api()
          .get(`/api/v1/products/${strangerProductId}`)
          .set(authed(strangerOwnerToken))
          .expect(200)
      ).body.units[0].id;

      await api()
        .patch(`/api/v1/products/${cokeId}/units/${theirUnit}`)
        .set(authed(ownerToken))
        .send({ priceTzs: 1 })
        .expect(404);
    });

    it('never lets one shop’s sales list carry another shop’s sale', async () => {
      const mine = await api()
        .get(`/api/v1/branches/${branchId}/sales?limit=100`)
        .set(authed(ownerToken))
        .expect(200);

      const branchIds = new Set(
        (mine.body.sales as Array<{ branchId: string }>).map((sale) => sale.branchId),
      );

      expect([...branchIds]).toEqual([branchId]);
    });

    it('leaves the audit log to the owner of the business it describes', async () => {
      const theirs = await api()
        .get('/api/v1/audit-events')
        .set(authed(strangerOwnerToken))
        .expect(200);

      const targets = (theirs.body as Array<{ targetId: string | null }>).map(
        (event) => event.targetId,
      );

      expect(targets).not.toContain(cokeId);
      expect(targets).not.toContain(managerId);
    });
  });
});

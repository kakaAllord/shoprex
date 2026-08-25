import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 8's acceptance check, start to finish, as one shop's first day.
 *
 * > A selected pilot shop can onboard, enroll devices, sell, receive stock,
 * > manage workers, view reports, and recover from ordinary network/API errors
 * > without data duplication.
 *
 * Every earlier phase proved its own half of this in isolation, and each of
 * those suites is still the place to look when something specific breaks. What
 * none of them could prove is the sentence above read as one sentence: that
 * the pieces join up in the order a real shop meets them, starting from an
 * empty database and a person with an email address.
 *
 * So this suite deliberately re-walks ground the others cover. That is not
 * duplication — it is the difference between "the sale route works" and "a
 * shop that signed up twenty minutes ago can take money", and only the second
 * one is what a pilot is asking about.
 *
 * Sections 7 and 8 are the ones that earn the phase. A wrong phone clock and a
 * dropped response are not features anybody demonstrates; they are what
 * happens when the demonstration goes wrong.
 */
describe('The pilot shop’s first day (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A real EAN-13 — the check digit is verified, so a made-up one proves nothing. */
  const sodaBarcode = '5901234123457';

  let ownerToken: string;
  let businessId: string;
  let counterBranchId: string;
  let storeBranchId: string;

  let managerToken: string;
  let sellerId: string;
  let sellerToken: string;
  let keeperId: string;
  let keeperToken: string;

  let counterDeviceId: string;

  let sodaId: string;
  let sodaCartonId: string;
  let sodaPieceId: string;

  let cashMethodId: string;
  let debtMethodId: string;

  let keyCounter = 0;
  const nextKey = () => `pilot-${(keyCounter += 1)}-${Date.now()}`;

  const stockOf = async (): Promise<number> =>
    (
      await api()
        .get(`/api/v1/branches/${counterBranchId}/stock/${sodaId}`)
        .set(authed(keeperToken))
        .expect(200)
    ).body.normalizedQuantity as number;

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

    // A pilot starts from nothing. So does this.
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------

  describe('1 — the shop signs itself up', () => {
    it('creates the business, the owner, and a session, from one form', async () => {
      const response = await api()
        .post('/api/v1/auth/signup')
        .send({
          shopName: 'Duka la Majaribio',
          fullName: 'Neema Mwakalinga',
          email: 'neema@duka-majaribio.co.tz',
          phone: '0712 345 678',
          password,
        })
        .expect(201);

      ownerToken = response.body.accessToken;

      expect(response.body.user.role).toBe('OWNER');
      // The backend decides which console an account belongs to, so the web
      // app never has to ask somebody what kind of user they are.
      expect(response.body.user.console).toBe('owner');

      businessId = response.body.user.businessId;
    });

    it('stores the phone number in one canonical form, however it was typed', async () => {
      const owner = await prisma.user.findFirst({ where: { businessId } });

      expect(owner?.phone).toBe('+255712345678');
    });

    it('gives the shop a Tanzanian day and Tanzanian money, without being asked', async () => {
      const business = await prisma.business.findUnique({ where: { id: businessId } });

      expect(business?.timezone).toBe('Africa/Dar_es_Salaam');
      expect(business?.currency).toBe('TZS');
    });

    it('starts with no branch at all, so the first one is the owner’s own act', async () => {
      // Worth stating rather than assuming: self-registration creates the
      // business and the owner and stops there. Only the development seed
      // makes a "Tawi Kuu". A real pilot shop therefore cannot sell, receive,
      // or enrol anything until somebody opens a branch, and every one of
      // those routes takes a branch id — so this is the first step of
      // onboarding, not a detail.
      const branches = await api().get('/api/v1/branches').set(authed(ownerToken)).expect(200);

      expect(branches.body).toHaveLength(0);
    });

    it('opens the branch the shop actually trades from', async () => {
      const branch = await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Kaunta' })
        .expect(201);

      counterBranchId = branch.body.id;

      expect(
        (await api().get('/api/v1/branches').set(authed(ownerToken)).expect(200)).body,
      ).toHaveLength(1);
    });

    it('gives the shop three ways of being paid before it sells anything', async () => {
      const methods = await api()
        .get('/api/v1/payment-methods')
        .set(authed(ownerToken))
        .expect(200);

      expect(methods.body.map((method: { kind: string }) => method.kind).sort()).toEqual([
        'CASH',
        'DEBT',
        'MOBILE_MONEY',
      ]);

      cashMethodId = methods.body.find((method: { kind: string }) => method.kind === 'CASH').id;
      debtMethodId = methods.body.find((method: { kind: string }) => method.kind === 'DEBT').id;
    });

    it('opens a second branch, and says who opened it', async () => {
      const branch = await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Ghala' })
        .expect(201);

      storeBranchId = branch.body.id;

      // Phase 8's audit review found BRANCH_CREATED declared in the schema
      // since Phase 1 and written by nobody, so an owner asking "who opened
      // this" got an empty log that read as proof nothing had happened.
      const events = await api().get('/api/v1/audit-events').set(authed(ownerToken)).expect(200);

      expect(
        events.body.some(
          (event: { action: string; targetId: string }) =>
            event.action === 'BRANCH_CREATED' && event.targetId === storeBranchId,
        ),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------

  describe('2 — the owner takes on staff', () => {
    it('creates a manager for the counter, with an email to sign in on the web', async () => {
      const manager = await api()
        .post('/api/v1/users/managers')
        .set(authed(ownerToken))
        .send({
          fullName: 'Baraka Msuya',
          email: 'baraka@duka-majaribio.co.tz',
          password,
          branchIds: [counterBranchId],
          permissions: [UserPermission.VIEW_REPORTS, UserPermission.VIEW_STOCK],
        })
        .expect(201);

      expect(manager.body.role).toBe('MANAGER');

      managerToken = (
        await api()
          .post('/api/v1/auth/login')
          .send({ email: 'baraka@duka-majaribio.co.tz', password })
          .expect(200)
      ).body.accessToken;
    });

    it('creates a seller from a name and a password — no email, because they never need one', async () => {
      const seller = await api()
        .post('/api/v1/users/workers')
        .set(authed(ownerToken))
        .send({
          fullName: 'Juma Hassan',
          password,
          branchId: counterBranchId,
          permissions: [UserPermission.SELL],
        })
        .expect(201);

      sellerId = seller.body.id;

      expect(seller.body.email).toBeNull();
    });

    it('creates a stock keeper for the back room', async () => {
      const keeper = await api()
        .post('/api/v1/users/workers')
        .set(authed(ownerToken))
        .send({
          fullName: 'Amina Said',
          password,
          branchId: counterBranchId,
          permissions: [UserPermission.RECEIVE_STOCK, UserPermission.VIEW_STOCK],
        })
        .expect(201);

      keeperId = keeper.body.id;
    });

    it('refuses a branch belonging to somebody else with 404, never 403', async () => {
      const otherOwner = await api()
        .post('/api/v1/auth/signup')
        .send({
          shopName: 'Duka Jingine',
          fullName: 'Mtu Mwingine',
          email: 'mwingine@duka-jingine.co.tz',
          phone: '0755000111',
          password,
        })
        .expect(201);

      const theirBranch = (
        await api()
          .post('/api/v1/branches')
          .set(authed(otherOwner.body.accessToken))
          .send({ name: 'Tawi Lao' })
          .expect(201)
      ).body.id;

      // 403 would confirm the id exists. 404 says nothing at all.
      await api()
        .post('/api/v1/users/workers')
        .set(authed(ownerToken))
        .send({
          fullName: 'Mfanyakazi Hewa',
          password,
          branchId: theirBranch,
          permissions: [UserPermission.SELL],
        })
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------

  describe('3 — a phone is enrolled at the counter', () => {
    let issuedCode: string;

    it('issues a one-time code for a branch, and draws it as a QR', async () => {
      const issued = await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId: counterBranchId, deviceName: 'Simu ya kaunta' })
        .expect(201);

      issuedCode = issued.body.code;

      expect(issuedCode).toMatch(/[A-Z0-9]/);
      // Both ways in, one code: the QR carries the bare code and nothing else,
      // so scanning and typing submit an identical string.
      expect(issued.body.qrSvg).toContain('<svg');
    });

    it('never stores the code itself, only its hash', async () => {
      const stored = await prisma.deviceEnrollmentToken.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      });

      expect(stored).not.toBeNull();
      expect(JSON.stringify(stored)).not.toContain(issuedCode.replace(/-/g, ''));
    });

    it('lets the phone redeem it, and mints the device id server-side', async () => {
      const enrolled = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issuedCode })
        .expect(200);

      counterDeviceId = enrolled.body.deviceId;

      expect(counterDeviceId).toBeTruthy();
      expect(enrolled.body.businessName).toBe('Duka la Majaribio');
    });

    it('refuses the same code a second time', async () => {
      await api().post('/api/v1/devices/enroll').send({ code: issuedCode }).expect(401);
    });

    it('offers the phone the people who actually work at that branch', async () => {
      const people = await api().get(`/api/v1/auth/device/${counterDeviceId}/people`).expect(200);

      const names = people.body.map((person: { fullName: string }) => person.fullName);

      expect(names).toEqual(expect.arrayContaining(['Juma Hassan', 'Amina Said']));
      // The owner reaches every branch, so they can stand at the counter too.
      expect(names).toContain('Neema Mwakalinga');
      // Names and ids only. Choosing a name grants nothing.
      expect(JSON.stringify(people.body)).not.toContain('password');
    });

    it('signs the seller and the stock keeper in on the same handset', async () => {
      sellerToken = (
        await api()
          .post('/api/v1/auth/device/login')
          .send({ deviceId: counterDeviceId, userId: sellerId, password })
          .expect(200)
      ).body.accessToken;

      keeperToken = (
        await api()
          .post('/api/v1/auth/device/login')
          .send({ deviceId: counterDeviceId, userId: keeperId, password })
          .expect(200)
      ).body.accessToken;

      expect(sellerToken).toBeTruthy();
      expect(keeperToken).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------

  describe('4 — the first delivery arrives', () => {
    it('lets a seller add a product that nobody has catalogued yet', async () => {
      // Doc 01 §5: an unknown item must be addable mid-sale, so SELL is enough.
      const soda = await api()
        .post('/api/v1/products')
        .set(authed(sellerToken))
        .send({
          name: 'Soda ya Machungwa 500ml',
          units: [
            { name: 'Kreti', priceTzs: 12_000 },
            { name: 'Chupa', priceTzs: 1_000 },
          ],
          relationships: [{ parentUnit: 'Kreti', childUnit: 'Chupa', factor: 12 }],
          barcode: sodaBarcode,
        })
        .expect(201);

      sodaId = soda.body.id;
      sodaCartonId = soda.body.units.find((unit: { name: string }) => unit.name === 'Kreti').id;
      sodaPieceId = soda.body.units.find((unit: { name: string }) => unit.name === 'Chupa').id;
    });

    it('records the delivery in the packaging it arrived in', async () => {
      const receipt = await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [
            { productId: sodaId, productUnitId: sodaCartonId, quantity: 5, unitCostTzs: 9_000 },
          ],
        })
        .expect(201);

      // Five Kreti, not sixty Chupa — that is what is on the floor.
      expect(receipt.body.lines[0].quantity).toBe(5);
      expect(receipt.body.lines[0].normalizedQuantity).toBe(60);
    });

    it('reads back as physical packages the shopkeeper would recite', async () => {
      const stock = await api()
        .get(`/api/v1/branches/${counterBranchId}/stock/${sodaId}`)
        .set(authed(keeperToken))
        .expect(200);

      expect(stock.body.normalizedQuantity).toBe(60);
      expect(
        stock.body.packages.map(
          (pack: { quantity: number; unitName: string }) => `${pack.quantity} ${pack.unitName}`,
        ),
      ).toEqual(['5 Kreti']);
    });

    it('refuses a seller who was never given RECEIVE_STOCK', async () => {
      await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(sellerToken))
        .send({ lines: [{ productId: sodaId, productUnitId: sodaCartonId, quantity: 1 }] })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('5 — the shop takes money', () => {
    let firstSaleId: string;

    it('finds the item from the barcode on the bottle', async () => {
      const found = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: sodaBarcode })
        .set(authed(sellerToken))
        .expect(200);

      expect(found.body.id).toBe(sodaId);
    });

    it('refuses a mis-scan rather than storing a code nothing will ever match', async () => {
      // A valid-looking thirteen digits with a wrong check digit. This is what
      // a smudged label or a half-read scan actually produces.
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123456' })
        .set(authed(sellerToken))
        .expect(400);

      // A well-formed code the shop has simply never carried is a different
      // problem, and gets a different answer — that is the create-inline
      // moment on the phone, not an error to bounce off.
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '4006381333931' })
        .set(authed(sellerToken))
        .expect(404);
    });

    it('sells a bottle for cash and works out the change itself', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 2 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 2_000, cashReceivedTzs: 5_000 }],
        })
        .expect(201);

      firstSaleId = sale.body.id;

      expect(sale.body.totalTzs).toBe(2_000);
      // Change is computed by the backend from the cash actually tendered.
      expect(sale.body.changeTzs).toBe(3_000);
      expect(sale.body.soldByName).toBe('Juma Hassan');
      // Attribution comes from the session and the handset both.
      expect(sale.body.deviceId).toBe(counterDeviceId);
    });

    it('breaks a Kreti open rather than refusing, and never repackages upward', async () => {
      const stock = await api()
        .get(`/api/v1/branches/${counterBranchId}/stock/${sodaId}`)
        .set(authed(keeperToken))
        .expect(200);

      expect(stock.body.normalizedQuantity).toBe(58);
      // 4 Kreti and 10 loose Chupa. The ten loose bottles stay loose.
      expect(
        stock.body.packages.map(
          (pack: { quantity: number; unitName: string }) => `${pack.quantity} ${pack.unitName}`,
        ),
      ).toEqual(['4 Kreti', '10 Chupa']);
    });

    it('snapshots the price, so repricing tomorrow cannot rewrite today', async () => {
      await api()
        .patch(`/api/v1/products/${sodaId}/units/${sodaPieceId}`)
        .set(authed(ownerToken))
        .send({ priceTzs: 1_500 })
        .expect(200);

      const receipt = await api()
        .get(`/api/v1/branches/${counterBranchId}/sales/${firstSaleId}`)
        .set(authed(sellerToken))
        .expect(200);

      expect(receipt.body.lines[0].unitPriceTzs).toBe(1_000);
      expect(receipt.body.totalTzs).toBe(2_000);
    });

    it('sells on credit, recording a name and an amount and nothing else', async () => {
      const sale = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 2 }],
          payments: [
            { paymentMethodId: debtMethodId, amountTzs: 3_000, debtorName: 'Mzee Mabula' },
          ],
        })
        .expect(201);

      expect(sale.body.debtTzs).toBe(3_000);
      expect(sale.body.payments[0].debtorName).toBe('Mzee Mabula');
    });

    it('lets the seller read back the sale they just rang up, without VIEW_REPORTS', async () => {
      await api()
        .get(`/api/v1/branches/${counterBranchId}/sales/${firstSaleId}`)
        .set(authed(sellerToken))
        .expect(200);

      // Browsing the whole day, though, is a management act.
      await api()
        .get(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('6 — the owner reads the day back', () => {
    it('shows the day’s takings, the debts, and who sold them', async () => {
      const report = await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .set(authed(ownerToken))
        .expect(200);

      expect(report.body.totals.salesTotalTzs).toBe(5_000);
      expect(report.body.totals.debtTzs).toBe(3_000);
      // What is actually in the till: the bills less the debts inside them.
      expect(report.body.totals.collectedTzs).toBe(2_000);
      expect(report.body.debts[0].debtorName).toBe('Mzee Mabula');
      expect(report.body.sellers[0].name).toBe('Juma Hassan');
      expect(report.body.topProducts[0].productName).toBe('Soda ya Machungwa 500ml');
    });

    it('hands the same numbers over as a PDF', async () => {
      const pdf = await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily.pdf`)
        .set(authed(ownerToken))
        .expect(200);

      const text = Buffer.from(pdf.body).toString('latin1');

      expect(text.startsWith('%PDF-')).toBe(true);
      // The text stream is deliberately uncompressed, so the numbers can be
      // read straight back out of the bytes rather than taken on trust.
      expect(text).toContain('Mzee Mabula');
      expect(text).toContain('Juma Hassan');
    });

    it('lets the manager see their own branch and refuses the one they were not given', async () => {
      await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .set(authed(managerToken))
        .expect(200);

      await api()
        .get(`/api/v1/branches/${storeBranchId}/reports/daily`)
        .set(authed(managerToken))
        .expect(404);
    });

    it('refuses a seller the report outright', async () => {
      await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .set(authed(sellerToken))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('7 — the phone’s clock is wrong, and it does not matter', () => {
    it('refuses a sale that tries to tell the backend when it happened', async () => {
      // `forbidNonWhitelisted` is what makes this a refusal rather than a
      // silent drop, and a refusal is what a client author needs: a field that
      // is quietly ignored looks like it worked.
      await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          createdAt: '2001-01-01T00:00:00.000Z',
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
        })
        .expect(400);
    });

    it('refuses a delivery that tries the same thing', async () => {
      await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          createdAt: '2001-01-01T00:00:00.000Z',
          lines: [{ productId: sodaId, productUnitId: sodaCartonId, quantity: 1 }],
        })
        .expect(400);
    });

    it('stamps the sale with the backend clock, whatever the handset believes', async () => {
      const before = Date.now();

      const sale = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
        })
        .expect(201);

      const after = Date.now();
      const stamped = new Date(sale.body.createdAt).getTime();

      // Not "close to now" — inside the window this request actually occupied.
      expect(stamped).toBeGreaterThanOrEqual(before - 1_000);
      expect(stamped).toBeLessThanOrEqual(after + 1_000);
    });

    it('reports a sale under the shop’s day, not the device’s and not UTC’s', async () => {
      // 19:30 UTC on the 20th is 22:30 the same evening in Dar es Salaam, so
      // the shop calls it the 20th. 21:30 UTC on the 20th is already 00:30 on
      // the 21st in the shop. Only the server's stamp and the shop's timezone
      // decide which, and this proves the pair of them agree on both sides of
      // a boundary that is not UTC midnight.
      const sale = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
        })
        .expect(201);

      await prisma.sale.update({
        where: { id: sale.body.id },
        data: { createdAt: new Date('2026-08-20T19:30:00.000Z') },
      });

      const onTheDay = await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .query({ date: '2026-08-20' })
        .set(authed(ownerToken))
        .expect(200);

      expect(
        onTheDay.body.transactions.some((entry: { id: string }) => entry.id === sale.body.id),
      ).toBe(true);

      await prisma.sale.update({
        where: { id: sale.body.id },
        data: { createdAt: new Date('2026-08-20T21:30:00.000Z') },
      });

      const nextDay = await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .query({ date: '2026-08-21' })
        .set(authed(ownerToken))
        .expect(200);

      expect(
        nextDay.body.transactions.some((entry: { id: string }) => entry.id === sale.body.id),
      ).toBe(true);

      // Tidied away so it cannot skew the totals section 8 reads.
      await prisma.salePayment.deleteMany({ where: { saleId: sale.body.id } });
      await prisma.saleLine.deleteMany({ where: { saleId: sale.body.id } });
      await prisma.sale.delete({ where: { id: sale.body.id } });
    });

    it('stamps a device sign-in with the backend clock too', async () => {
      const before = Date.now();

      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: counterDeviceId, userId: sellerId, password })
        .expect(200);

      const device = await prisma.device.findUnique({ where: { id: counterDeviceId } });

      expect(device?.lastSeenAt?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    });
  });

  // -------------------------------------------------------------------------

  describe('8 — the network drops, and nothing is recorded twice', () => {
    it('returns the first sale when the seller presses Lipa again', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 2_000 }],
      };

      const first = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send(body)
        .expect(201);

      const retry = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send(body)
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.sale.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('takes the stock and the money only once, and reports it only once', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
      };

      const before = await stockOf();
      const beforeSales = (
        await api()
          .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
          .set(authed(ownerToken))
          .expect(200)
      ).body.totals.salesTotalTzs;

      await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send(body)
        .expect(201);
      await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send(body)
        .expect(201);

      const afterSales = (
        await api()
          .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
          .set(authed(ownerToken))
          .expect(200)
      ).body.totals.salesTotalTzs;

      expect(await stockOf()).toBe(before - 1);
      expect(afterSales).toBe(beforeSales + 1_500);
    });

    it('returns the first delivery when the stock keeper presses Hifadhi again', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: sodaId, productUnitId: sodaCartonId, quantity: 2 }],
      };

      const before = await stockOf();

      const first = await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(body)
        .expect(201);

      const retry = await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send(body)
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);
      // Two Kreti of twelve, once.
      expect(await stockOf()).toBe(before + 24);
    });

    it('leaves nothing at all behind when a sale fails on its third line', async () => {
      const key = nextKey();

      const salesBefore = await prisma.sale.count();
      const movementsBefore = await prisma.stockMovement.count();
      const paymentsBefore = await prisma.salePayment.count();

      await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: key,
          lines: [
            { productId: sodaId, productUnitId: sodaPieceId, quantity: 1 },
            { productId: sodaId, productUnitId: sodaPieceId, quantity: 1 },
            // A unit that does not exist. The first two lines are perfectly
            // good, and must still leave no trace.
            {
              productId: sodaId,
              productUnitId: '00000000-0000-4000-8000-000000000000',
              quantity: 1,
            },
          ],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 4_500, cashReceivedTzs: 4_500 }],
        })
        .expect(400);

      expect(await prisma.sale.count()).toBe(salesBefore);
      expect(await prisma.stockMovement.count()).toBe(movementsBefore);
      expect(await prisma.salePayment.count()).toBe(paymentsBefore);
      // And the key was never consumed, so the seller can fix the cart and
      // ring the sale up properly rather than being locked out of it.
      expect(await prisma.sale.count({ where: { idempotencyKey: key } })).toBe(0);
    });

    it('leaves nothing behind when a delivery fails on its third line', async () => {
      const receiptsBefore = await prisma.stockReceipt.count();
      const movementsBefore = await prisma.stockMovement.count();
      const before = await stockOf();

      await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [
            { productId: sodaId, productUnitId: sodaCartonId, quantity: 1 },
            { productId: sodaId, productUnitId: sodaPieceId, quantity: 1 },
            {
              productId: sodaId,
              productUnitId: '00000000-0000-4000-8000-000000000000',
              quantity: 1,
            },
          ],
        })
        .expect(404);

      expect(await prisma.stockReceipt.count()).toBe(receiptsBefore);
      expect(await prisma.stockMovement.count()).toBe(movementsBefore);
      expect(await stockOf()).toBe(before);
    });

    it('collapses two identical sales racing each other onto one', async () => {
      const key = nextKey();
      const body = {
        idempotencyKey: key,
        lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
      };

      const [a, b] = await Promise.all([
        api().post(`/api/v1/branches/${counterBranchId}/sales`).set(authed(sellerToken)).send(body),
        api().post(`/api/v1/branches/${counterBranchId}/sales`).set(authed(sellerToken)).send(body),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.sale.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('sells past the last bottle, going negative rather than refusing', async () => {
      // A seller holding the item is not told the shop does not have it. The
      // balance goes negative, the shortfall is recorded on the line, and the
      // owner is given something to recount.
      const stock = await stockOf();

      const sale = await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: stock + 3 }],
          payments: [
            {
              paymentMethodId: cashMethodId,
              amountTzs: 1_500 * (stock + 3),
              cashReceivedTzs: 1_500 * (stock + 3),
            },
          ],
        })
        .expect(201);

      expect(sale.body.hasStockInconsistency).toBe(true);
      expect(sale.body.lines[0].shortfallNormalized).toBe(3);
      expect(await stockOf()).toBe(-3);

      // And it is named in the audit log, so it is a thing to fix rather than
      // a number that quietly went wrong.
      const events = await api().get('/api/v1/audit-events').set(authed(ownerToken)).expect(200);

      expect(
        events.body.some((event: { action: string }) => event.action === 'STOCK_INCONSISTENCY'),
      ).toBe(true);
    });

    it('lands on the true count when the missing stock is received later', async () => {
      // Negative is self-correcting: received minus sold always equals the
      // balance, so receiving a Kreti onto -3 lands on 9 with nobody doing
      // arithmetic by hand.
      await api()
        .post(`/api/v1/branches/${counterBranchId}/stock-receipts`)
        .set(authed(keeperToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaCartonId, quantity: 1 }],
        })
        .expect(201);

      expect(await stockOf()).toBe(9);
    });
  });

  // -------------------------------------------------------------------------

  describe('9 — a phone is lost, and the shop is closed and reopened', () => {
    it('refuses a revoked phone on its very next request, token unchanged', async () => {
      await api()
        .post(`/api/v1/devices/${counterDeviceId}/revoke`)
        .set(authed(ownerToken))
        .expect(200);

      // The very same token that worked a moment ago.
      await api()
        .post(`/api/v1/branches/${counterBranchId}/sales`)
        .set(authed(sellerToken))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: sodaId, productUnitId: sodaPieceId, quantity: 1 }],
          payments: [{ paymentMethodId: cashMethodId, amountTzs: 1_500, cashReceivedTzs: 1_500 }],
        })
        .expect(401);

      // And it will not even say who works at that branch any more.
      await api().get(`/api/v1/auth/device/${counterDeviceId}/people`).expect(401);
    });

    it('keeps every sale the revoked phone ever rang up', async () => {
      expect(await prisma.sale.count({ where: { deviceId: counterDeviceId } })).toBeGreaterThan(0);
    });

    it('suspends the whole shop on the next request, without deleting anything', async () => {
      // A platform administrator, created the way the seed does: no business,
      // and the seller's own bcrypt hash so the password below is real.
      const sellerRow = await prisma.user.findUniqueOrThrow({ where: { id: sellerId } });

      const admin = await prisma.user.create({
        data: {
          email: 'hardening-admin@shoprex.co.tz',
          fullName: 'Msimamizi wa Jukwaa',
          role: 'PLATFORM_ADMIN',
          passwordHash: sellerRow.passwordHash,
        },
      });

      const adminToken = (
        await api().post('/api/v1/auth/login').send({ email: admin.email, password }).expect(200)
      ).body.accessToken;

      await api()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authed(adminToken))
        .send({ isActive: false })
        .expect(200);

      // The owner's existing, still-unexpired token stops working at once. An
      // account suspended everywhere except in the sessions already open is
      // not suspended. 403, not 401: the credentials were never the problem.
      await api().get('/api/v1/auth/me').set(authed(ownerToken)).expect(403);

      await api()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authed(adminToken))
        .send({ isActive: true })
        .expect(200);

      // Restored whole: the same token works again and the day still reads.
      await api().get('/api/v1/auth/me').set(authed(ownerToken)).expect(200);

      const report = await api()
        .get(`/api/v1/branches/${counterBranchId}/reports/daily`)
        .set(authed(ownerToken))
        .expect(200);

      expect(report.body.totals.salesTotalTzs).toBeGreaterThan(0);
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 7's acceptance check, driven end to end over real HTTP.
 *
 *   "A user can select a date and branch, view the same totals in the
 *    dashboard and PDF, and verify that the report uses Tanzania local-day
 *    boundaries derived from server-stamped timestamps."
 *
 * Three clauses, and each one is proven here rather than inspected:
 *
 * 1. **Select a date and branch.** §2 and §3.
 * 2. **The same totals in the dashboard and the PDF.** §4 reads the numbers
 *    back *out of the generated PDF* and compares them to the JSON the
 *    dashboard is served. The PDF's text stream is deliberately uncompressed
 *    for exactly this reason.
 * 3. **Tanzania local-day boundaries from server-stamped timestamps.** §1.
 *
 * ## Why this suite writes `createdAt` directly
 *
 * There is no API that lets a client set a sale's timestamp, and there must
 * not be — that is doc 03's Timestamp rule and the reason a phone with a wrong
 * clock cannot move a sale into another day's takings. So a sale is completed
 * over HTTP the way a seller makes one, and *then* its `createdAt` is pushed
 * to a chosen instant with Prisma, which is the only honest way to put a sale
 * at 23:59 local time in a test that runs at 09:00. The **backend** still owns
 * the boundary; the test only controls where the sale sits relative to it.
 */
describe('Daily reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** The shop's own zone, and the one the whole check is written about. */
  const TZ = 'Africa/Dar_es_Salaam';
  /** The day under test. Local midnight is 21:00 UTC the evening before. */
  const DAY = '2026-08-21';

  let ownerToken: string;
  let ownerId: string;
  /** SELL + VIEW_REPORTS: a seller who may also read the day back. */
  let neemaToken: string;
  let neemaId: string;
  /** SELL only — may sell, may not read a report. */
  let jumaToken: string;
  let jumaId: string;
  /** A manager assigned to the second branch only. */
  let managerToken: string;

  let branchId: string;
  let otherBranchId: string;

  let cashId: string;
  let mobileId: string;
  let debtId: string;

  let cokeId: string;
  let pieceId: string;
  let cartonId: string;

  let idempotency = 0;

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

  /**
   * Rings up a sale over HTTP, then moves it to `at`.
   *
   * The sale itself goes through the real route — the same one the phone
   * calls — so the totals, the settlement, and the stock movement are all
   * genuine. Only where it sits in time is arranged.
   */
  const sellAt = async (
    at: string,
    token: string,
    branch: string,
    lines: Array<{ productUnitId: string; quantity: number }>,
    payments: Array<Record<string, unknown>>,
  ): Promise<string> => {
    idempotency += 1;

    const sale = await api()
      .post(`/api/v1/branches/${branch}/sales`)
      .set(authed(token))
      .send({
        idempotencyKey: `report-e2e-${idempotency}`,
        lines: lines.map((line) => ({ productId: cokeId, ...line })),
        payments,
      })
      .expect(201);

    await prisma.sale.update({
      where: { id: sale.body.id },
      data: { createdAt: new Date(at) },
    });

    return sale.body.id as string;
  };

  const receiveAt = async (
    at: string,
    token: string,
    branch: string,
    lines: Array<Record<string, unknown>>,
  ): Promise<string> => {
    const receipt = await api()
      .post(`/api/v1/branches/${branch}/stock-receipts`)
      .set(authed(token))
      .send({ lines: lines.map((line) => ({ productId: cokeId, ...line })) })
      .expect(201);

    await prisma.stockReceipt.update({
      where: { id: receipt.body.id },
      data: { createdAt: new Date(at) },
    });

    return receipt.body.id as string;
  };

  /** Left un-awaited so `.expect(...)` still chains, the supertest way. */
  const report = (token: string, branch: string, date?: string): request.Test =>
    api()
      .get(`/api/v1/branches/${branch}/reports/daily`)
      .query(date ? { date } : {})
      .set(authed(token));

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
        shopName: 'Duka la Ripoti',
        email: 'owner@ripoti.co.tz',
        phone: '0716000070',
        password,
        fullName: 'Mmiliki Ripoti',
      })
      .expect(201);

    ownerToken = signup.body.accessToken;
    ownerId = signup.body.user.id;

    branchId = (
      await api().post('/api/v1/branches').set(authed(ownerToken)).send({ name: 'Tawi Kuu' }).expect(201)
    ).body.id;

    otherBranchId = (
      await api().post('/api/v1/branches').set(authed(ownerToken)).send({ name: 'Tawi la Pili' }).expect(201)
    ).body.id;

    const methods = (
      await api().get('/api/v1/payment-methods').set(authed(ownerToken)).expect(200)
    ).body as Array<{ id: string; kind: string }>;

    cashId = methods.find((method) => method.kind === 'CASH')!.id;
    mobileId = methods.find((method) => method.kind === 'MOBILE_MONEY')!.id;
    debtId = methods.find((method) => method.kind === 'DEBT')!.id;

    // 1 Kreti = 6 Vipande, the shape doc 02 §5 is written about.
    const coke = await api()
      .post('/api/v1/products')
      .set(authed(ownerToken))
      .send({
        name: 'Coca-Cola 500ml',
        units: [
          { name: 'Kreti', priceTzs: 5_400 },
          { name: 'Kipande', priceTzs: 1_000 },
        ],
        relationships: [{ parentUnit: 'Kreti', childUnit: 'Kipande', factor: 6 }],
      })
      .expect(201);

    cokeId = coke.body.id;
    pieceId = coke.body.units.find((unit: { name: string }) => unit.name === 'Kipande').id;
    cartonId = coke.body.units.find((unit: { name: string }) => unit.name === 'Kreti').id;

    const neema = await enrollWorker(
      'Neema',
      [UserPermission.SELL, UserPermission.VIEW_REPORTS, UserPermission.RECEIVE_STOCK],
      branchId,
    );
    neemaToken = neema.token;
    neemaId = neema.userId;

    const juma = await enrollWorker('Juma', [UserPermission.SELL], branchId);
    jumaToken = juma.token;
    jumaId = juma.userId;

    const manager = await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerToken))
      .send({
        fullName: 'Meneja wa Pili',
        email: 'meneja@ripoti.co.tz',
        password,
        branchIds: [otherBranchId],
        permissions: [UserPermission.VIEW_REPORTS],
      })
      .expect(201);

    managerToken = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja@ripoti.co.tz', password })
        .expect(200)
    ).body.accessToken;

    expect(manager.body.id).toBeTruthy();

    // Plenty of stock, so nothing below goes negative except where it means to.
    await receiveAt(`${DAY}T06:00:00Z`, ownerToken, branchId, [
      { productUnitId: cartonId, quantity: 40, unitCostTzs: 4_800 },
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------

  /**
   * The clause the whole module exists for. Dar es Salaam is UTC+3, so the
   * local day runs from 21:00 UTC the evening before to 21:00 UTC on the day
   * itself — and a sale one millisecond either side of that belongs to a
   * different day's takings.
   */
  describe('§1 — the day is the shop’s, from server-stamped timestamps', () => {
    beforeAll(async () => {
      // 23:59:59.999 local on the 20th — one millisecond too early.
      await sellAt(`2026-08-20T20:59:59.999Z`, neemaToken, branchId, [
        { productUnitId: pieceId, quantity: 1 },
      ], [{ paymentMethodId: cashId, amountTzs: 1_000, cashReceivedTzs: 1_000 }]);

      // 00:00:00.000 local on the 21st — the day's very first instant.
      await sellAt(`2026-08-20T21:00:00.000Z`, neemaToken, branchId, [
        { productUnitId: pieceId, quantity: 2 },
      ], [{ paymentMethodId: cashId, amountTzs: 2_000, cashReceivedTzs: 2_000 }]);

      // 23:59:59.999 local on the 21st — the day's very last instant.
      await sellAt(`2026-08-21T20:59:59.999Z`, neemaToken, branchId, [
        { productUnitId: pieceId, quantity: 3 },
      ], [{ paymentMethodId: cashId, amountTzs: 3_000, cashReceivedTzs: 3_000 }]);

      // 00:00:00.000 local on the 22nd — one millisecond too late.
      await sellAt(`2026-08-21T21:00:00.000Z`, neemaToken, branchId, [
        { productUnitId: pieceId, quantity: 4 },
      ], [{ paymentMethodId: cashId, amountTzs: 4_000, cashReceivedTzs: 4_000 }]);
    });

    it('returns the exact UTC instants it counted, rather than asking to be trusted', async () => {
      const response = await report(ownerToken, branchId, DAY).expect(200);

      expect(response.body.window).toMatchObject({
        date: DAY,
        timezone: TZ,
        startUtc: '2026-08-20T21:00:00.000Z',
        endUtc: '2026-08-21T21:00:00.000Z',
      });
    });

    it('counts the day’s first and last instant and neither of its neighbours', async () => {
      const response = await report(ownerToken, branchId, DAY).expect(200);

      // 2,000 at the first instant + 3,000 at the last. The 1,000 before and
      // the 4,000 after belong to the 20th and the 22nd.
      expect(response.body.totals.saleCount).toBe(2);
      expect(response.body.totals.salesTotalTzs).toBe(5_000);
    });

    it('gives the neighbouring days the sales this one refused', async () => {
      const before = await report(ownerToken, branchId, '2026-08-20').expect(200);
      const after = await report(ownerToken, branchId, '2026-08-22').expect(200);

      expect(before.body.totals.salesTotalTzs).toBe(1_000);
      expect(after.body.totals.salesTotalTzs).toBe(4_000);
    });

    /**
     * A UTC-midnight boundary would put the 21:00–24:00 local sales in the
     * *next* day. This is the assertion that fails if anybody ever "simplifies"
     * `dayWindow()` away.
     */
    it('does not cut the day at UTC midnight', async () => {
      const response = await report(ownerToken, branchId, DAY).expect(200);

      expect(response.body.window.startUtc).not.toBe('2026-08-21T00:00:00.000Z');
      expect(new Date(response.body.window.startUtc).getUTCHours()).toBe(21);
    });

    it('hands one day over to the next with no gap and no overlap', async () => {
      const first = await report(ownerToken, branchId, DAY).expect(200);
      const second = await report(ownerToken, branchId, '2026-08-22').expect(200);

      expect(second.body.window.startUtc).toBe(first.body.window.endUtc);
    });

    it('refuses a date no calendar has, rather than answering for another day', async () => {
      await report(ownerToken, branchId, '2026-02-30').expect(400);
      await report(ownerToken, branchId, '21-08-2026').expect(400);
      await report(ownerToken, branchId, 'today').expect(400);
    });

    it('defaults to today, decided by the server and not by the caller', async () => {
      const response = await report(ownerToken, branchId).expect(200);

      const todayHere = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      expect(response.body.window.date).toBe(todayHere);
      expect(response.body.window.timezone).toBe(TZ);
    });
  });

  // -------------------------------------------------------------------------

  describe('§2 — the day, read back', () => {
    beforeAll(async () => {
      // A mixed payment: 6,000 cash and 4,000 on the phone.
      await sellAt(`${DAY}T09:00:00Z`, neemaToken, branchId, [
        { productUnitId: cartonId, quantity: 1 },
        { productUnitId: pieceId, quantity: 4 },
      ], [
        { paymentMethodId: cashId, amountTzs: 6_000, cashReceivedTzs: 10_000 },
        { paymentMethodId: mobileId, amountTzs: 3_400 },
      ]);

      // A debt against a name, sold by somebody else.
      await sellAt(`${DAY}T11:00:00Z`, jumaToken, branchId, [
        { productUnitId: pieceId, quantity: 8 },
      ], [{ paymentMethodId: debtId, amountTzs: 8_000, debtorName: 'Mama Neema' }]);

      // The same debtor again, spelled differently.
      await sellAt(`${DAY}T14:00:00Z`, jumaToken, branchId, [
        { productUnitId: pieceId, quantity: 2 },
      ], [{ paymentMethodId: debtId, amountTzs: 2_000, debtorName: 'mama neema' }]);

      await receiveAt(`${DAY}T07:30:00Z`, neemaToken, branchId, [
        { productUnitId: cartonId, quantity: 3, unitCostTzs: 4_800 },
        { productUnitId: pieceId, quantity: 5 },
      ]);
    });

    it('separates what was sold from what was actually collected', async () => {
      const { totals } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      // 2,000 + 3,000 (§1) + 9,400 + 8,000 + 2,000.
      expect(totals.salesTotalTzs).toBe(24_400);
      expect(totals.debtTzs).toBe(10_000);
      expect(totals.collectedTzs).toBe(14_400);
    });

    /**
     * Change is worked out per **cash payment**, not against the whole bill:
     * on the mixed sale, 10,000 was handed over to settle the 6,000 cash
     * portion, so 4,000 went back while the phone settled the rest. The report
     * repeats that number and never subtracts it from anything — the customer
     * paid 9,400 and the 4,000 was never the shop's.
     */
    it('reports change without subtracting it from anything', async () => {
      const { totals } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      expect(totals.changeTzs).toBe(4_000);
      expect(totals.salesTotalTzs).toBe(24_400);
      expect(totals.collectedTzs).toBe(totals.salesTotalTzs - totals.debtTzs);
    });

    it('breaks the day down by payment method, adding up to the total exactly', async () => {
      const { paymentBreakdown, totals } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      const summed = paymentBreakdown.reduce(
        (sum: number, row: { amountTzs: number }) => sum + row.amountTzs,
        0,
      );

      expect(summed).toBe(totals.salesTotalTzs);
      expect(paymentBreakdown.map((row: { methodName: string }) => row.methodName).sort()).toEqual([
        'Deni',
        'Pesa ya simu',
        'Taslimu',
      ]);
    });

    it('sums one debtor’s debts under one name, however they were capitalised', async () => {
      const { debts } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      expect(debts).toEqual([{ debtorName: 'Mama Neema', amountTzs: 10_000, saleCount: 2 }]);
    });

    it('totals each seller from the session, not from the handset', async () => {
      const { sellers } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      const byId = Object.fromEntries(
        sellers.map((row: { userId: string; salesTotalTzs: number }) => [row.userId, row.salesTotalTzs]),
      );

      expect(byId[jumaId]).toBe(10_000);
      expect(byId[neemaId]).toBe(14_400);
      expect(byId[ownerId]).toBeUndefined();
    });

    it('lists what arrived, in the packaging it arrived in', async () => {
      const { received } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      const rows = Object.fromEntries(
        received.rows.map((row: { unitName: string; quantity: number }) => [row.unitName, row.quantity]),
      );

      // The 40 Kreti opening delivery is at 06:00 on the same day, plus 3 more.
      expect(rows.Kreti).toBe(43);
      expect(rows.Kipande).toBe(5);
      expect(received.receiptCount).toBe(2);
    });

    it('reports an unrecorded cost as null rather than as zero', async () => {
      const { received } = (await report(ownerToken, branchId, DAY).expect(200)).body;

      const pieces = received.rows.find((row: { unitName: string }) => row.unitName === 'Kipande');

      expect(pieces.costTzs).toBeNull();
      expect(received.costIsPartial).toBe(true);
    });

    it('lists the transactions themselves, newest first', async () => {
      const { transactions, transactionsTruncated } = (
        await report(ownerToken, branchId, DAY).expect(200)
      ).body;

      expect(transactionsTruncated).toBe(false);
      expect(transactions).toHaveLength(5);

      const times = transactions.map((row: { createdAt: string }) => row.createdAt);
      expect([...times]).toEqual([...times].sort().reverse());

      // The newest is §1's last-instant sale — 23:59:59.999 local, settled in
      // cash — not the 14:00 debt, which is what "newest first" has to mean
      // for a day that runs to local midnight rather than to UTC midnight.
      expect(transactions[0].createdAt).toBe('2026-08-21T20:59:59.999Z');
      expect(transactions[0].paymentMethods).toEqual(['Taslimu']);
      expect(transactions[transactions.length - 1].createdAt).toBe('2026-08-20T21:00:00.000Z');
    });

    it('agrees with the sales list filtered to the same date', async () => {
      const listed = await api()
        .get(`/api/v1/branches/${branchId}/sales`)
        .query({ date: DAY, limit: 100 })
        .set(authed(ownerToken))
        .expect(200);

      const reported = (await report(ownerToken, branchId, DAY).expect(200)).body;

      expect(listed.body.sales).toHaveLength(reported.totals.saleCount);
      expect(
        listed.body.sales.reduce((sum: number, sale: { totalTzs: number }) => sum + sale.totalTzs, 0),
      ).toBe(reported.totals.salesTotalTzs);
    });

    it('answers an empty day with zeroes rather than a 404', async () => {
      const response = await report(ownerToken, branchId, '2026-01-01').expect(200);

      expect(response.body.totals).toMatchObject({ saleCount: 0, salesTotalTzs: 0, collectedTzs: 0 });
      expect(response.body.paymentBreakdown).toEqual([]);
      expect(response.body.debts).toEqual([]);
      expect(response.body.received.rows).toEqual([]);
      expect(response.body.received.totalCostTzs).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  describe('§3 — selecting a branch', () => {
    beforeAll(async () => {
      const keeper = await enrollWorker(
        'Muuzaji wa Pili',
        [UserPermission.SELL, UserPermission.RECEIVE_STOCK],
        otherBranchId,
      );

      await api()
        .post(`/api/v1/branches/${otherBranchId}/stock-receipts`)
        .set(authed(keeper.token))
        .send({ lines: [{ productId: cokeId, productUnitId: cartonId, quantity: 10 }] })
        .expect(201);

      await sellAt(`${DAY}T10:00:00Z`, keeper.token, otherBranchId, [
        { productUnitId: cartonId, quantity: 2 },
      ], [{ paymentMethodId: cashId, amountTzs: 10_800, cashReceivedTzs: 10_800 }]);
    });

    it('reports each branch separately', async () => {
      const first = await report(ownerToken, branchId, DAY).expect(200);
      const second = await report(ownerToken, otherBranchId, DAY).expect(200);

      expect(first.body.branch.name).toBe('Tawi Kuu');
      expect(second.body.branch.name).toBe('Tawi la Pili');
      expect(second.body.totals.salesTotalTzs).toBe(10_800);
      expect(first.body.totals.salesTotalTzs).not.toBe(second.body.totals.salesTotalTzs);
    });

    it('compares the branches over the same day, resolved by the same code', async () => {
      const comparison = await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(ownerToken))
        .expect(200);

      expect(comparison.body.window.startUtc).toBe('2026-08-20T21:00:00.000Z');
      expect(comparison.body.branches).toHaveLength(2);

      const byName = Object.fromEntries(
        comparison.body.branches.map((row: { branchName: string; salesTotalTzs: number }) => [
          row.branchName,
          row.salesTotalTzs,
        ]),
      );

      expect(byName['Tawi Kuu']).toBe(24_400);
      expect(byName['Tawi la Pili']).toBe(10_800);
      expect(comparison.body.totals.salesTotalTzs).toBe(35_200);
    });

    it('agrees, branch by branch, with each branch’s own report', async () => {
      const comparison = await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(ownerToken))
        .expect(200);

      for (const row of comparison.body.branches as Array<{ branchId: string; salesTotalTzs: number; collectedTzs: number }>) {
        const single = await report(ownerToken, row.branchId, DAY).expect(200);

        expect(row.salesTotalTzs).toBe(single.body.totals.salesTotalTzs);
        expect(row.collectedTzs).toBe(single.body.totals.collectedTzs);
      }
    });
  });

  // -------------------------------------------------------------------------

  /**
   * The acceptance check's central clause. The PDF's text stream is
   * uncompressed on purpose, so the numbers a reader would see are the
   * numbers this test can read — no second implementation, no parsing library,
   * and no way for the two to drift apart unnoticed.
   */
  describe('§4 — the same totals in the dashboard and the PDF', () => {
    const money = (amountTzs: number): string => `TSh ${amountTzs.toLocaleString('en-GB')}`;

    const fetchPdf = async (branch: string, date: string): Promise<string> => {
      const response = await api()
        .get(`/api/v1/branches/${branch}/reports/daily.pdf`)
        .query({ date })
        .set(authed(ownerToken))
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      return (response.body as Buffer).toString('latin1');
    };

    it('is served as a PDF, named after the branch and the shop-local day', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/reports/daily.pdf`)
        .query({ date: DAY })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain(`${DAY}.pdf`);
      expect(response.headers['content-disposition']).toContain('tawi-kuu');
    });

    it('is a real PDF document', async () => {
      const pdf = await fetchPdf(branchId, DAY);

      expect(pdf.startsWith('%PDF-')).toBe(true);
      expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    });

    it('carries the very same headline totals the dashboard was given', async () => {
      const dashboard = (await report(ownerToken, branchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(branchId, DAY);

      for (const amount of [
        dashboard.totals.salesTotalTzs,
        dashboard.totals.debtTzs,
        dashboard.totals.collectedTzs,
        dashboard.totals.changeTzs,
      ]) {
        expect(pdf).toContain(`(${money(amount)}) Tj`);
      }
    });

    it('carries the same payment breakdown', async () => {
      const dashboard = (await report(ownerToken, branchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(branchId, DAY);

      for (const row of dashboard.paymentBreakdown as Array<{ methodName: string; amountTzs: number }>) {
        expect(pdf).toContain(`(${row.methodName}) Tj`);
        expect(pdf).toContain(`(${money(row.amountTzs)}) Tj`);
      }
    });

    it('carries the same debts, under the same names', async () => {
      const dashboard = (await report(ownerToken, branchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(branchId, DAY);

      for (const row of dashboard.debts as Array<{ debtorName: string; amountTzs: number }>) {
        expect(pdf).toContain(`(${row.debtorName}) Tj`);
        expect(pdf).toContain(`(${money(row.amountTzs)}) Tj`);
      }
    });

    it('carries the same seller totals', async () => {
      const dashboard = (await report(ownerToken, branchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(branchId, DAY);

      for (const row of dashboard.sellers as Array<{ name: string; salesTotalTzs: number }>) {
        expect(pdf).toContain(`(${row.name}) Tj`);
        expect(pdf).toContain(`(${money(row.salesTotalTzs)}) Tj`);
      }
    });

    /**
     * Not decoration: it is what lets somebody holding a printed report check
     * that it covers the day they think it does.
     */
    it('prints the window it was computed over, and the shop’s zone', async () => {
      const dashboard = (await report(ownerToken, branchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(branchId, DAY);

      expect(pdf).toContain(dashboard.window.startUtc);
      expect(pdf).toContain(dashboard.window.endUtc);
      expect(pdf).toContain(TZ);
      expect(pdf).toContain('Duka la Ripoti');
      expect(pdf).toContain('Tawi Kuu');
    });

    it('says so on an empty day rather than rendering a blank page', async () => {
      const pdf = await fetchPdf(branchId, '2026-01-01');

      expect(pdf).toContain('Hakuna malipo siku hii');
      expect(pdf).toContain('Hakuna deni siku hii');
      expect(pdf).toContain('Hakuna mzigo siku hii');
      expect(pdf).toContain(`(${money(0)}) Tj`);
    });

    it('reports the other branch’s numbers when the other branch is asked for', async () => {
      const dashboard = (await report(ownerToken, otherBranchId, DAY).expect(200)).body;
      const pdf = await fetchPdf(otherBranchId, DAY);

      expect(pdf).toContain('Tawi la Pili');
      expect(pdf).toContain(`(${money(dashboard.totals.salesTotalTzs)}) Tj`);
    });
  });

  // -------------------------------------------------------------------------

  describe('§5 — who may read a report', () => {
    it('lets a worker holding VIEW_REPORTS read their own branch', async () => {
      const response = await report(neemaToken, branchId, DAY).expect(200);

      expect(response.body.totals.salesTotalTzs).toBe(24_400);
    });

    it('refuses a seller who does not hold VIEW_REPORTS', async () => {
      await report(jumaToken, branchId, DAY).expect(403);
      await api()
        .get(`/api/v1/branches/${branchId}/reports/daily.pdf`)
        .query({ date: DAY })
        .set(authed(jumaToken))
        .expect(403);
      await api().get('/api/v1/reports/branches').set(authed(jumaToken)).expect(403);
    });

    /**
     * Hiding the button is not authorization — the PDF must be refused at the
     * backend on its own, because a URL can be typed.
     */
    it('refuses the PDF to the same people it refuses the dashboard', async () => {
      await api()
        .get(`/api/v1/branches/${branchId}/reports/daily.pdf`)
        .query({ date: DAY })
        .expect(401);
    });

    it('answers 404, not 403, for a branch inside the shop a manager was not given', async () => {
      await report(managerToken, branchId, DAY).expect(404);
      await api()
        .get(`/api/v1/branches/${branchId}/reports/daily.pdf`)
        .query({ date: DAY })
        .set(authed(managerToken))
        .expect(404);
    });

    it('lets that manager read the branch they were given', async () => {
      const response = await report(managerToken, otherBranchId, DAY).expect(200);

      expect(response.body.branch.id).toBe(otherBranchId);
    });

    it('shows a manager only their own branches in the comparison', async () => {
      const comparison = await api()
        .get('/api/v1/reports/branches')
        .query({ date: DAY })
        .set(authed(managerToken))
        .expect(200);

      expect(comparison.body.branches).toHaveLength(1);
      expect(comparison.body.branches[0].branchId).toBe(otherBranchId);
    });

    it('refuses a platform administrator, who has no business of their own', async () => {
      const admin = await prisma.user.findFirst({ where: { role: 'PLATFORM_ADMIN' } });

      if (!admin) {
        // The seed is not loaded in this schema; nothing to assert against.
        return;
      }

      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password })
        .expect(200);

      await api()
        .get('/api/v1/reports/branches')
        .set(authed(session.body.accessToken))
        .expect(403);
    });
  });
});

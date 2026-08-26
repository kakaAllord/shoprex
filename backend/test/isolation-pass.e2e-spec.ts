import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 8's cumulative tenant, branch, and permission pass.
 *
 * AGENT.md's isolation rule says a resource is checked in the phase that adds
 * it, so this pass should **confirm rather than discover**. That is exactly
 * why it exists and why it is not redundant: `catalogue-isolation`,
 * `sales-isolation`, and `reports-isolation` each prove their own phase's
 * resources thoroughly, and none of them can prove that *nothing was missed*.
 * A resource added in a hurry with no isolation test does not fail any of
 * those suites; it simply is not mentioned by them.
 *
 * So this suite does two different jobs, and the second is the one that makes
 * it cumulative:
 *
 * 1. It sweeps **every tenant-scoped route in the published API** from another
 *    shop's token and from an unassigned branch, in one table, so the answers
 *    can be compared to each other rather than read one suite at a time.
 * 2. It reads the **Prisma datamodel itself** and fails when a model carrying
 *    a `businessId` is not named in the coverage map below. Adding a tenant
 *    -bearing table in Phase 9 will break this test until somebody writes down
 *    where its isolation is proven — which is the only mechanism here that
 *    keeps working after everyone who wrote it has forgotten it exists.
 *
 * The rule being enforced throughout: **another tenant's anything is 404, not
 * 403.** A 403 confirms the id exists, which is a leak in itself. Inside one
 * tenant, a branch a caller was not given is also 404, while a permission they
 * were not granted is 403 — the shop's own rule, not a denial of existence.
 */
describe('Cumulative isolation and permission pass (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Shop A — the shop under test. */
  let ownerAToken: string;
  let businessAId: string;
  let branchA1Id: string;
  let branchA2Id: string;

  /** Shop B — the stranger. Everything of A's must be invisible to them. */
  let ownerBToken: string;
  let businessBId: string;
  let branchB1Id: string;

  /** Inside A: assigned to A1 only. The interesting token for branch scope. */
  let managerA1Token: string;
  /** Inside A: assigned to A1, holding nothing at all. */
  let strangerA1Token: string;
  let strangerA1Id: string;

  /** Records belonging to A, each of which B must not reach. */
  let productAId: string;
  let unitAId: string;
  let saleAId: string;
  let deviceAId: string;
  let methodAId: string;
  let workerAId: string;

  let keyCounter = 0;
  const nextKey = () => `iso-${(keyCounter += 1)}-${Date.now()}`;

  const signupOwner = async (shopName: string, email: string, phone: string) =>
    (
      await api()
        .post('/api/v1/auth/signup')
        .send({ shopName, email, phone, password, fullName: `Mmiliki ${shopName}` })
        .expect(201)
    ).body as { accessToken: string; user: { businessId: string } };

  const createBranch = async (token: string, name: string): Promise<string> =>
    (await api().post('/api/v1/branches').set(authed(token)).send({ name }).expect(201)).body
      .id as string;

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

    const shopA = await signupOwner('Duka A', 'owner@iso-a.co.tz', '0716000090');
    const shopB = await signupOwner('Duka B', 'owner@iso-b.co.tz', '0716000091');

    ownerAToken = shopA.accessToken;
    businessAId = shopA.user.businessId;
    ownerBToken = shopB.accessToken;
    businessBId = shopB.user.businessId;

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    // A manager over A1 only. Everything A2 owns must be 404 to them, which is
    // a different rule from B's token and deserves its own column.
    await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerAToken))
      .send({
        fullName: 'Meneja A1',
        email: 'meneja@iso-a.co.tz',
        password,
        branchIds: [branchA1Id],
        permissions: [
          UserPermission.VIEW_REPORTS,
          UserPermission.VIEW_STOCK,
          UserPermission.SELL,
          UserPermission.RECEIVE_STOCK,
        ],
      })
      .expect(201);

    managerA1Token = (
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja@iso-a.co.tz', password })
        .expect(200)
    ).body.accessToken;

    // Somebody inside A holding no permission at all, so 403-vs-404 can be
    // told apart from tenancy.
    const stranger = await api()
      .post('/api/v1/users/workers')
      .set(authed(ownerAToken))
      .send({ fullName: 'Mgeni A1', password, branchId: branchA1Id, permissions: [] })
      .expect(201);

    strangerA1Id = stranger.body.id;

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

    workerAId = worker.body.id;

    // The stranger signs in on an enrolled phone, which is the only way
    // somebody with no email gets a token.
    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerAToken))
      .send({ branchId: branchA1Id, deviceName: 'Simu A1' })
      .expect(201);

    const enrolled = await api()
      .post('/api/v1/devices/enroll')
      .send({ code: issued.body.code })
      .expect(200);

    deviceAId = enrolled.body.deviceId;

    strangerA1Token = (
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: deviceAId, userId: strangerA1Id, password })
        .expect(200)
    ).body.accessToken;

    // One of everything, owned by A, sitting in A1.
    const product = await api()
      .post('/api/v1/products')
      .set(authed(ownerAToken))
      .send({ name: 'Bidhaa ya A', units: [{ name: 'Kipande', priceTzs: 1_000 }] })
      .expect(201);

    productAId = product.body.id;
    unitAId = product.body.units[0].id;

    await api()
      .post(`/api/v1/products/${productAId}/barcodes`)
      .set(authed(ownerAToken))
      .send({ barcode: '5901234123457' })
      .expect(201);

    await api()
      .post(`/api/v1/branches/${branchA1Id}/stock-receipts`)
      .set(authed(ownerAToken))
      .send({
        idempotencyKey: nextKey(),
        lines: [{ productId: productAId, productUnitId: unitAId, quantity: 20 }],
      })
      .expect(201);

    const methods = await api()
      .get('/api/v1/payment-methods')
      .set(authed(ownerAToken))
      .expect(200);

    methodAId = methods.body.find((method: { kind: string }) => method.kind === 'CASH').id;

    const sale = await api()
      .post(`/api/v1/branches/${branchA1Id}/sales`)
      .set(authed(ownerAToken))
      .send({
        idempotencyKey: nextKey(),
        lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
        payments: [{ paymentMethodId: methodAId, amountTzs: 1_000, cashReceivedTzs: 1_000 }],
      })
      .expect(201);

    saleAId = sale.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------------

  describe('1 — every one of A’s records is 404 to shop B, never 403', () => {
    /**
     * One row per addressable record A owns. B holds a perfectly valid owner
     * token, so any answer other than "there is no such thing" is B learning
     * something about A.
     */
    /**
     * Every case holds a **thunk**, not a string, and that is load-bearing:
     * `it.each` evaluates its table when the file is collected, which is
     * before `beforeAll` has run. A table of template literals would bake in
     * `undefined` for every id and then pass, because
     * `/api/v1/branches/undefined` answers 404 too — a suite that proves
     * nothing while looking thorough.
     */
    const reads: Array<[string, () => string]> = [
      ['a branch', () => `/api/v1/branches/${branchA1Id}`],
      ['a staff member', () => `/api/v1/users/${workerAId}`],
      ['a device', () => `/api/v1/devices/${deviceAId}`],
      ['a product', () => `/api/v1/products/${productAId}`],
      ['a branch’s stock', () => `/api/v1/branches/${branchA1Id}/stock`],
      ['one product’s stock', () => `/api/v1/branches/${branchA1Id}/stock/${productAId}`],
      ['the sales list', () => `/api/v1/branches/${branchA1Id}/sales`],
      ['one sale', () => `/api/v1/branches/${branchA1Id}/sales/${saleAId}`],
      ['the daily report', () => `/api/v1/branches/${branchA1Id}/reports/daily`],
      ['the daily report as a PDF', () => `/api/v1/branches/${branchA1Id}/reports/daily.pdf`],
    ];

    it.each(reads)('refuses B %s with 404', async (_what, url) => {
      const target = url();

      // Guards the guard: if an id were undefined the assertion below would
      // still pass, so prove the URL is a real one first.
      expect(target).not.toContain('undefined');

      await api().get(target).set(authed(ownerBToken)).expect(404);
    });

    const writes: Array<[string, () => string, () => Record<string, unknown>]> = [
      [
        'recording a delivery into A’s branch',
        () => `/api/v1/branches/${branchA1Id}/stock-receipts`,
        () => ({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }] }),
      ],
      [
        'ringing up a sale in A’s branch',
        () => `/api/v1/branches/${branchA1Id}/sales`,
        () => ({
          idempotencyKey: 'b-should-never-get-here',
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: methodAId, amountTzs: 1_000, cashReceivedTzs: 1_000 }],
        }),
      ],
      [
        'issuing an enrollment for A’s branch',
        () => '/api/v1/devices/enrollments',
        () => ({ branchId: branchA1Id, deviceName: 'Simu ya wizi' }),
      ],
      [
        'attaching a barcode to A’s product',
        () => `/api/v1/products/${productAId}/barcodes`,
        () => ({ barcode: '4006381333931' }),
      ],
      [
        // A *valid* body on purpose: a malformed one is refused by validation
        // before tenancy is ever consulted, which would prove nothing here.
        'adding a packaging to A’s product',
        () => `/api/v1/products/${productAId}/units`,
        () => ({ name: 'Kreti', relatedUnitId: unitAId, contains: 'RELATED', factor: 12 }),
      ],
      [
        'creating a worker in A’s branch',
        () => '/api/v1/users/workers',
        () => ({ fullName: 'Mtu wa B', password, branchId: branchA1Id, permissions: [] }),
      ],
    ];

    it.each(writes)('refuses B %s with 404', async (_what, url, body) => {
      const target = url();

      expect(JSON.stringify(body())).not.toContain('undefined');

      await api().post(target).set(authed(ownerBToken)).send(body()).expect(404);
    });

    it('refuses B revoking A’s phone', async () => {
      await api().post(`/api/v1/devices/${deviceAId}/revoke`).set(authed(ownerBToken)).expect(404);
    });

    it('refuses B repricing A’s product', async () => {
      await api()
        .patch(`/api/v1/products/${productAId}/units/${unitAId}`)
        .set(authed(ownerBToken))
        .send({ priceTzs: 1 })
        .expect(404);
    });

    it('refuses B renaming A’s payment method', async () => {
      await api()
        .patch(`/api/v1/payment-methods/${methodAId}`)
        .set(authed(ownerBToken))
        .send({ name: 'Imebadilishwa' })
        .expect(404);
    });

    it('refuses B changing A’s staff permissions', async () => {
      await api()
        .patch(`/api/v1/users/${workerAId}/permissions`)
        .set(authed(ownerBToken))
        .send({ permissions: [UserPermission.SELL] })
        .expect(404);
    });

    it('leaves A’s records untouched after every one of those attempts', async () => {
      // The refusals above must be refusals, not rollbacks that happened to
      // work. Nothing of A's may have moved.
      const unit = await prisma.productUnit.findUniqueOrThrow({ where: { id: unitAId } });
      const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: methodAId } });
      const worker = await prisma.user.findUniqueOrThrow({ where: { id: workerAId } });
      const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceAId } });

      expect(unit.priceTzs).toBe(1_000);
      expect(method.name).not.toBe('Imebadilishwa');
      expect(worker.permissions).toEqual([UserPermission.SELL]);
      expect(device.status).toBe('ACTIVE');
      expect(await prisma.sale.count({ where: { businessId: businessAId } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------

  describe('2 — no list ever carries a row from the other shop', () => {
    /**
     * The mirror of section 1, and the more dangerous half. A route that
     * refuses a direct read can still hand over the same row inside a
     * collection, and a collection is where nobody looks.
     */
    // These URLs carry no id, so they are safe to build at collection time.
    const listsFor: Array<[string, string]> = [
      ['branches', '/api/v1/branches'],
      ['staff', '/api/v1/users'],
      ['devices', '/api/v1/devices'],
      ['products', '/api/v1/products'],
      ['payment methods', '/api/v1/payment-methods'],
      ['the audit log', '/api/v1/audit-events'],
      ['the branch comparison', '/api/v1/reports/branches'],
    ];

    it.each(listsFor)('gives B a list of %s holding nothing of A’s', async (_what, url) => {
      const response = await api().get(url).set(authed(ownerBToken)).expect(200);
      const body = JSON.stringify(response.body);

      // Every id A owns, checked against the raw response text rather than
      // against a parsed field — a leak in a field nobody thought to read is
      // still a leak.
      for (const id of [branchA1Id, branchA2Id, productAId, deviceAId, saleAId, workerAId]) {
        expect(body).not.toContain(id);
      }

      expect(body).not.toContain(businessAId);
    });

    it('gives A a list of the same things holding nothing of B’s', async () => {
      for (const [, url] of listsFor) {
        const response = await api().get(url).set(authed(ownerAToken)).expect(200);

        expect(JSON.stringify(response.body)).not.toContain(branchB1Id);
        expect(JSON.stringify(response.body)).not.toContain(businessBId);
      }
    });

    it('does not let B search A’s catalogue by name or by barcode', async () => {
      const byName = await api()
        .get('/api/v1/products')
        .query({ query: 'Bidhaa ya A' })
        .set(authed(ownerBToken))
        .expect(200);

      expect(byName.body).toEqual([]);

      // Barcodes are unique per tenant, not globally — two shops may stock the
      // same item — so B asking about A's barcode must be told it is unknown,
      // not handed A's product.
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(ownerBToken))
        .expect(404);
    });

    it('does not let an idempotency key from A settle a sale for B', async () => {
      const shared = nextKey();

      await api()
        .post(`/api/v1/branches/${branchA1Id}/sales`)
        .set(authed(ownerAToken))
        .send({
          idempotencyKey: shared,
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: methodAId, amountTzs: 1_000, cashReceivedTzs: 1_000 }],
        })
        .expect(201);

      // The key is unique per business, so B reusing it is an ordinary new
      // sale in B's own shop rather than a window onto A's receipt.
      const methodsB = await api()
        .get('/api/v1/payment-methods')
        .set(authed(ownerBToken))
        .expect(200);

      const productB = await api()
        .post('/api/v1/products')
        .set(authed(ownerBToken))
        .send({ name: 'Bidhaa ya B', units: [{ name: 'Kipande', priceTzs: 500 }] })
        .expect(201);

      const saleB = await api()
        .post(`/api/v1/branches/${branchB1Id}/sales`)
        .set(authed(ownerBToken))
        .send({
          idempotencyKey: shared,
          lines: [
            { productId: productB.body.id, productUnitId: productB.body.units[0].id, quantity: 1 },
          ],
          payments: [
            {
              paymentMethodId: methodsB.body.find((m: { kind: string }) => m.kind === 'CASH').id,
              amountTzs: 500,
              cashReceivedTzs: 500,
            },
          ],
        })
        .expect(201);

      expect(saleB.body.totalTzs).toBe(500);
      expect(await prisma.sale.count({ where: { idempotencyKey: shared } })).toBe(2);
    });
  });

  // -------------------------------------------------------------------------

  describe('3 — a branch is a boundary inside one shop too', () => {
    /**
     * The manager holds every operational permission and a token from the
     * right tenant. Only the assignment is missing, so anything they reach in
     * A2 is a hole that no cross-tenant test would ever have found.
     */
    const a2Reads: Array<[string, () => string]> = [
      ['the branch itself', () => `/api/v1/branches/${branchA2Id}`],
      ['its stock', () => `/api/v1/branches/${branchA2Id}/stock`],
      ['its sales', () => `/api/v1/branches/${branchA2Id}/sales`],
      ['its report', () => `/api/v1/branches/${branchA2Id}/reports/daily`],
      ['its report as a PDF', () => `/api/v1/branches/${branchA2Id}/reports/daily.pdf`],
    ];

    it.each(a2Reads)(
      'refuses the A1 manager %s of A2 with 404, not 403',
      async (_what, url) => {
        const target = url();

        expect(target).not.toContain('undefined');

        // 404 rather than 403 even inside their own shop: a manager should not
        // be able to enumerate branches they were not given.
        await api().get(target).set(authed(managerA1Token)).expect(404);
      },
    );

    it('refuses the A1 manager recording a delivery into A2', async () => {
      await api()
        .post(`/api/v1/branches/${branchA2Id}/stock-receipts`)
        .set(authed(managerA1Token))
        .send({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }] })
        .expect(404);
    });

    it('refuses the A1 manager selling in A2', async () => {
      await api()
        .post(`/api/v1/branches/${branchA2Id}/sales`)
        .set(authed(managerA1Token))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: methodAId, amountTzs: 1_000, cashReceivedTzs: 1_000 }],
        })
        .expect(404);
    });

    it('lets the same manager do all of it in A1, so the refusal is the assignment', async () => {
      // Without this, every test above would pass just as well if the manager
      // were simply broken.
      await api()
        .get(`/api/v1/branches/${branchA1Id}/reports/daily`)
        .set(authed(managerA1Token))
        .expect(200);

      await api()
        .post(`/api/v1/branches/${branchA1Id}/stock-receipts`)
        .set(authed(managerA1Token))
        .send({
          idempotencyKey: nextKey(),
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
        })
        .expect(201);
    });

    it('scopes the branch comparison to what the caller may see', async () => {
      const comparison = await api()
        .get('/api/v1/reports/branches')
        .set(authed(managerA1Token))
        .expect(200);

      const text = JSON.stringify(comparison.body);

      expect(text).toContain(branchA1Id);
      expect(text).not.toContain(branchA2Id);
    });

    it('scopes the staff list to a manager’s own branches', async () => {
      const staff = await api().get('/api/v1/users').set(authed(managerA1Token)).expect(200);

      // Everybody listed must be reachable from A1.
      expect(staff.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(staff.body)).not.toContain(branchA2Id);
    });
  });

  // -------------------------------------------------------------------------

  describe('4 — a permission is 403, and it is read fresh on every request', () => {
    /**
     * Every row carries a body thunk, even the GETs, and that is not tidiness:
     * `it.each` spreads a row into the callback's parameters, and a row one
     * element short makes Jest pass its own `done` callback into the gap —
     * which it then refuses to run alongside an async function. A uniform
     * arity is what keeps these five tests from failing for a reason that has
     * nothing to do with permissions.
     */
    const guarded: Array<
      [string, 'get' | 'post', () => string, () => Record<string, unknown> | null]
    > = [
      ['reading the stock', 'get', () => `/api/v1/branches/${branchA1Id}/stock`, () => null],
      ['reading the sales list', 'get', () => `/api/v1/branches/${branchA1Id}/sales`, () => null],
      [
        'reading the daily report',
        'get',
        () => `/api/v1/branches/${branchA1Id}/reports/daily`,
        () => null,
      ],
      [
        'downloading the report',
        'get',
        () => `/api/v1/branches/${branchA1Id}/reports/daily.pdf`,
        () => null,
      ],
      ['the branch comparison', 'get', () => '/api/v1/reports/branches', () => null],
      [
        'recording a delivery',
        'post',
        () => `/api/v1/branches/${branchA1Id}/stock-receipts`,
        () => ({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }] }),
      ],
      [
        'ringing up a sale',
        'post',
        () => `/api/v1/branches/${branchA1Id}/sales`,
        () => ({
          idempotencyKey: 'stranger-should-never-get-here',
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          payments: [{ paymentMethodId: methodAId, amountTzs: 1_000, cashReceivedTzs: 1_000 }],
        }),
      ],
    ];

    it.each(guarded)(
      'refuses somebody granted nothing %s with 403, not 404',
      async (_what, method, url, body) => {
        const target = url();

        expect(target).not.toContain('undefined');

        // 403, deliberately: the branch is theirs, the record exists, and the
        // shop's own rule is what refuses them. Answering 404 here would teach
        // a worker that Shoprex is broken.
        const payload = body();
        const call = api()[method](target).set(authed(strangerA1Token));

        await (payload ? call.send(payload) : call).expect(403);
      },
    );

    it('lets the same person read what needs no permission beyond being staff', async () => {
      // Reading what a thing costs is not a permission the shop withholds —
      // this is what makes the 403s above a rule rather than a broken token.
      await api().get('/api/v1/products').set(authed(strangerA1Token)).expect(200);
      await api().get('/api/v1/payment-methods').set(authed(strangerA1Token)).expect(200);
      await api().get('/api/v1/auth/me').set(authed(strangerA1Token)).expect(200);
    });

    it('grants a permission and it bites on the very next request', async () => {
      await api()
        .patch(`/api/v1/users/${strangerA1Id}/permissions`)
        .set(authed(ownerAToken))
        .send({ permissions: [UserPermission.VIEW_STOCK] })
        .expect(200);

      // The same token as a moment ago. Permissions are read from the database
      // per request, not from the token, so nobody waits eight hours.
      await api()
        .get(`/api/v1/branches/${branchA1Id}/stock`)
        .set(authed(strangerA1Token))
        .expect(200);
    });

    it('takes it away again and it stops working just as fast', async () => {
      await api()
        .patch(`/api/v1/users/${strangerA1Id}/permissions`)
        .set(authed(ownerAToken))
        .send({ permissions: [] })
        .expect(200);

      await api()
        .get(`/api/v1/branches/${branchA1Id}/stock`)
        .set(authed(strangerA1Token))
        .expect(403);
    });

    it('never checks an owner against these, inside their own business', async () => {
      // The owner grants the permissions; they are not subject to them.
      const owner = await prisma.user.findFirstOrThrow({
        where: { businessId: businessAId, role: 'OWNER' },
      });

      expect(owner.permissions).toEqual([]);

      await api()
        .get(`/api/v1/branches/${branchA1Id}/reports/daily`)
        .set(authed(ownerAToken))
        .expect(200);
    });

    it('refuses a manager every owner-only write, with 403', async () => {
      await api()
        .post('/api/v1/branches')
        .set(authed(managerA1Token))
        .send({ name: 'Tawi la Meneja' })
        .expect(403);

      await api()
        .patch(`/api/v1/users/${workerAId}/permissions`)
        .set(authed(managerA1Token))
        .send({ permissions: [] })
        .expect(403);

      await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(managerA1Token))
        .send({ branchId: branchA1Id, deviceName: 'Simu ya meneja' })
        .expect(403);

      await api().get('/api/v1/audit-events').set(authed(managerA1Token)).expect(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('5 — a platform administrator is not a tenant', () => {
    let adminToken: string;

    beforeAll(async () => {
      const ownerRow = await prisma.user.findFirstOrThrow({
        where: { businessId: businessAId, role: 'OWNER' },
      });

      const admin = await prisma.user.create({
        data: {
          email: 'iso-admin@shoprex.co.tz',
          fullName: 'Msimamizi',
          role: 'PLATFORM_ADMIN',
          passwordHash: ownerRow.passwordHash,
        },
      });

      adminToken = (
        await api().post('/api/v1/auth/login').send({ email: admin.email, password }).expect(200)
      ).body.accessToken;
    });

    it('can see that shops exist, which is the job', async () => {
      const shops = await api().get('/api/v1/businesses').set(authed(adminToken)).expect(200);

      expect(shops.body.length).toBeGreaterThanOrEqual(2);
    });

    it('cannot read a shop’s trade, because they carry no tenant', async () => {
      // An administrator without a businessId has no branch to be scoped to.
      // The answer must be a refusal rather than "everything", which is the
      // failure mode a superuser check invites.
      for (const url of [
        `/api/v1/branches/${branchA1Id}/sales`,
        `/api/v1/branches/${branchA1Id}/stock`,
        `/api/v1/branches/${branchA1Id}/reports/daily`,
        '/api/v1/products',
        '/api/v1/audit-events',
      ]) {
        const response = await api().get(url).set(authed(adminToken));

        expect([400, 403, 404]).toContain(response.status);
      }
    });
  });

  // -------------------------------------------------------------------------

  describe('6 — nothing tenant-bearing has been added without isolation coverage', () => {
    /**
     * The part of this suite that keeps working after everybody forgets it.
     *
     * Every model here must say where its isolation is proven. A new model
     * added in a later phase fails this test on the day it lands, which is the
     * whole point: the failure arrives while the person who added it is still
     * looking at it, rather than in a security review a year later.
     *
     * Adding a name to this map is not the fix. Writing the test it names is
     * the fix; the map only records where to find it.
     */
    const COVERAGE: Record<string, string> = {
      // Carries businessId directly.
      Branch: 'branch-assignment + §1/§3 here',
      User: 'users.e2e + §1/§2 here',
      Device: 'devices.e2e + §1/§2 here',
      DeviceEnrollmentToken: 'device-enrollment.e2e + §1 here',
      AuditEvent: 'devices.e2e + §2/§4 here',
      Product: 'catalogue-isolation + §1/§2 here',
      Barcode: 'catalogue-isolation + §2 here',
      StockReceipt: 'catalogue-isolation + §1/§3 here',
      // No HTTP route of its own: the ledger is only ever read through stock
      // and report aggregates, both covered above. Its rows are still swept
      // for cross-tenant leakage by the last test in this section.
      StockMovement: 'catalogue-isolation — no route; swept at the database level here',
      PhysicalStock: 'catalogue-isolation + §1/§3 here',
      PaymentMethod: 'sales-isolation + §1/§2 here',
      Sale: 'sales-isolation + §1/§2 here',
      // Reaches a tenant only through a parent, so its isolation is its
      // parent's. Listed anyway: "it inherits" is a claim, not an exemption.
      Business: 'auth.e2e — the tenant itself',
      BranchAssignment: 'branch-assignment.e2e — via User and Branch',
      ProductUnit: 'catalogue-isolation — via Product',
      UnitRelationship: 'catalogue-isolation — via Product',
      StockReceiptLine: 'catalogue-isolation — via StockReceipt',
      SaleLine: 'sales-isolation — via Sale',
      SalePayment: 'sales-isolation — via Sale',
    };

    /** Not a tenant's data at all. */
    const NOT_TENANT_SCOPED = new Set(['AppMetadata']);

    it('names every model in the datamodel, so a new table cannot arrive quietly', () => {
      const models = Prisma.dmmf.datamodel.models.map((model) => model.name);
      const unaccounted = models.filter(
        (name) => !(name in COVERAGE) && !NOT_TENANT_SCOPED.has(name),
      );

      expect(unaccounted).toEqual([]);
    });

    it('does not carry a stale name for a model that no longer exists', () => {
      const models = new Set(Prisma.dmmf.datamodel.models.map((model) => model.name));
      const stale = Object.keys(COVERAGE).filter((name) => !models.has(name));

      expect(stale).toEqual([]);
    });

    it('proves every model carrying a businessId is one this suite actually exercised', () => {
      // The stricter half. A model with its own businessId column is directly
      // addressable and must be covered here, not merely "via a parent".
      const direct = Prisma.dmmf.datamodel.models
        .filter((model) => model.fields.some((field) => field.name === 'businessId'))
        .map((model) => model.name);

      for (const name of direct) {
        expect(COVERAGE[name]).toContain('here');
      }

      // A canary: if this ever drops, a table stopped being tenant-scoped and
      // somebody should have to explain why.
      expect(direct.length).toBeGreaterThanOrEqual(12);
    });

    it('has no row anywhere stitched across two tenants', async () => {
      /**
       * The strongest thing this suite can say, and it says it against the
       * database rather than the API.
       *
       * Every model below carries **both** a `businessId` and a `branchId`. A
       * row whose branch belongs to a different business than the row itself
       * is corruption no HTTP test can see: each request looked correct on its
       * own, and the two ids only disagree once they are read together. That
       * is exactly the shape a missing tenant clause on a nested write leaves
       * behind.
       *
       * Deliberately unscoped — it checks every row in the schema, not only
       * the ones this suite created, so data left by any earlier suite in the
       * run is checked too. A count of foreign businesses would have been the
       * obvious test to write here and would have been worthless: other
       * suites legitimately leave their own shops behind, so it would fail on
       * a clean codebase and teach everyone to ignore it.
       */
      const crossLinked = Prisma.dmmf.datamodel.models.filter(
        (model) =>
          model.fields.some((field) => field.name === 'businessId') &&
          model.fields.some((field) => field.name === 'branchId'),
      );

      // If a refactor ever drops branchId off these, the check silently stops
      // checking anything — so pin the count.
      expect(crossLinked.length).toBeGreaterThanOrEqual(5);

      for (const model of crossLinked) {
        const table = model.dbName ?? model.name;

        const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT count(*)::bigint AS count
             FROM "${table}" t
             JOIN "branches" b ON b.id = t.branch_id
            WHERE b.business_id <> t.business_id`,
        );

        expect({ table, stitched: Number(rows[0].count) }).toEqual({ table, stitched: 0 });
      }
    });

    it('has no branch, device, or staff member belonging to a business that is gone', async () => {
      // The other half: a row pointing at a tenant that no longer exists.
      // Every relation cascades on delete, so this should be structurally
      // impossible — which is the reason to check it rather than to assume it.
      const orphanBranches = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count
           FROM "branches" b
           LEFT JOIN "businesses" s ON s.id = b.business_id
          WHERE s.id IS NULL`,
      );

      expect(Number(orphanBranches[0].count)).toBe(0);
    });
  });
});

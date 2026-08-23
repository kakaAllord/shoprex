import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, StockDirection, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { StockService } from '../src/modules/stock/stock.service';

/**
 * Phase 3's acceptance check, driven through the real API: define
 * `1 Carton = 6 Pieces`, receive 6 Cartons, sell 1 Piece, and see
 * `5 Cartons + 5 Pieces` with the normalized quantity preserved.
 *
 * Selling is exercised through `StockService.issueStock` rather than an HTTP
 * route, because **Phase 3 deliberately ships no sale endpoint**. The cart,
 * payment settlement, and idempotency are Phase 4's to design, and guessing at
 * them here would only give Phase 4 something to work around. What Phase 3
 * owes is an engine that removes stock correctly, and that is what is proven.
 */
describe('Stock engine over the API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let stockService: StockService;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());

  let ownerToken: string;
  let ownerPrincipal: AuthenticatedUser;
  let branchId: string;

  let productId: string;
  let cartonId: string;
  let pieceId: string;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    stockService = app.get(StockService);

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
    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    const signup = await api()
      .post('/api/v1/auth/signup')
      .send({
        shopName: 'Duka la Injini',
        email: 'owner@injini.co.tz',
        phone: '0716000001',
        password,
        fullName: 'Mmiliki Injini',
      })
      .expect(201);

    ownerToken = signup.body.accessToken;
    ownerPrincipal = {
      userId: signup.body.user.id,
      email: signup.body.user.email,
      role: signup.body.user.role,
      businessId: signup.body.user.businessId,
      deviceId: null,
    };

    const branch = await api()
      .post('/api/v1/branches')
      .set(authed(ownerToken))
      .send({ name: 'Tawi la Injini' })
      .expect(201);

    branchId = branch.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('1 — the shop defines the product', () => {
    it('creates Coca-Cola 500ml with 1 Carton = 6 Pieces', async () => {
      const response = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Coca-Cola 500ml',
          units: [
            { name: 'Carton', priceTzs: 6000 },
            { name: 'Piece', priceTzs: 1000 },
          ],
          relationships: [{ parentUnit: 'Carton', childUnit: 'Piece', factor: 6 }],
          barcode: '5901234123457',
        })
        .expect(201);

      productId = response.body.id;
      cartonId = response.body.units.find((u: { name: string }) => u.name === 'Carton').id;
      pieceId = response.body.units.find((u: { name: string }) => u.name === 'Piece').id;

      expect(response.body.baseUnitId).toBe(pieceId);
    });

    it('reports how many base units each packaging holds', async () => {
      const response = await api()
        .get(`/api/v1/products/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.units).toEqual([
        expect.objectContaining({ name: 'Carton', factorToBase: 6, isBaseUnit: false }),
        expect.objectContaining({ name: 'Piece', factorToBase: 1, isBaseUnit: true }),
      ]);
    });
  });

  describe('2 — the shop receives 6 Cartons', () => {
    it('records the delivery in the packaging it arrived in', async () => {
      const response = await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({ lines: [{ productId, productUnitId: cartonId, quantity: 6 }] })
        .expect(201);

      expect(response.body.lines[0]).toMatchObject({
        unitName: 'Carton',
        quantity: 6,
        normalizedQuantity: 36,
      });
    });

    it('shows 6 Cartons and no loose Pieces', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.packages).toEqual([
        expect.objectContaining({ unitName: 'Carton', quantity: 6 }),
      ]);
      expect(response.body.normalizedQuantity).toBe(36);
    });

    it('stamps the delivery with the backend clock, not a client value', async () => {
      const receipt = await prisma.stockReceipt.findFirstOrThrow();

      expect(receipt.createdAt).toBeInstanceOf(Date);
      expect(Math.abs(Date.now() - receipt.createdAt.getTime())).toBeLessThan(60_000);
    });
  });

  describe('3 — the shop sells 1 Piece', () => {
    it('removes it through the engine, breaking a Carton open', async () => {
      const view = await stockService.issueStock(ownerPrincipal, branchId, {
        productId,
        unitId: pieceId,
        quantity: 1,
      });

      expect(view.packages).toEqual([
        expect.objectContaining({ unitName: 'Carton', quantity: 5 }),
        expect.objectContaining({ unitName: 'Piece', quantity: 5 }),
      ]);
    });
  });

  describe('4 — the shop now shows 5 Cartons + 5 Pieces', () => {
    it('reads back exactly that over the API', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(
        response.body.packages.map(
          (entry: { unitName: string; quantity: number }) =>
            `${entry.quantity} ${entry.unitName}`,
        ),
      ).toEqual(['5 Carton', '5 Piece']);
    });

    it('preserves the normalized quantity: 36 in, 1 out, 35 left', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.normalizedQuantity).toBe(35);
    });

    it('leaves a ledger that explains both movements', async () => {
      const movements = await prisma.stockMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      });

      expect(movements).toHaveLength(2);
      expect(movements[0]).toMatchObject({
        direction: StockDirection.IN,
        quantity: 6,
        normalizedQuantity: 36,
        conversionFactor: 6,
      });
      expect(movements[1]).toMatchObject({
        direction: StockDirection.OUT,
        quantity: 1,
        normalizedQuantity: 1,
        conversionFactor: 1,
      });
    });

    it('snapshots the conversion, so a later factor change cannot rewrite history', async () => {
      const line = await prisma.stockReceiptLine.findFirstOrThrow();

      // The delivery said 36 base units when it happened, and it always will.
      expect(line.normalizedQuantity).toBe(36);
    });
  });

  describe('refusing an invalid or cyclic package relationship', () => {
    it('refuses a unit that contains itself', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Bidhaa ya Mzunguko',
          units: [{ name: 'Carton' }],
          relationships: [{ parentUnit: 'Carton', childUnit: 'Carton', factor: 2 }],
        })
        .expect(400);
    });

    it('refuses a two-unit cycle', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Bidhaa ya Mzunguko 2',
          units: [{ name: 'Carton' }, { name: 'Piece' }],
          relationships: [
            { parentUnit: 'Carton', childUnit: 'Piece', factor: 6 },
            { parentUnit: 'Piece', childUnit: 'Carton', factor: 1 },
          ],
        })
        .expect(400);
    });

    it('refuses units that do not connect to each other', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Bidhaa Isiyounganishwa',
          units: [{ name: 'Piece' }, { name: 'kg' }],
        })
        .expect(400);
    });

    it('refuses a business redefining a fixed measurement conversion', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Sukari Feki',
          units: [{ name: 'kg' }, { name: 'g' }],
          relationships: [{ parentUnit: 'kg', childUnit: 'g', factor: 900 }],
        })
        .expect(400);
    });

    it('accepts the fixed conversion when it is stated correctly', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Sukari Halisi',
          units: [{ name: 'kg' }, { name: 'g' }],
          relationships: [{ parentUnit: 'kg', childUnit: 'g', factor: 1000 }],
        })
        .expect(201);
    });

    it('creates nothing at all when the graph is refused', async () => {
      const orphans = await prisma.product.findMany({
        where: { name: { startsWith: 'Bidhaa ya Mzunguko' } },
      });

      expect(orphans).toEqual([]);
    });
  });

  describe('a product may be configured progressively', () => {
    let cartonOnlyId: string;
    let cartonOnlyUnitId: string;

    it('accepts a product sold only by Carton, with no Piece defined', async () => {
      const response = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Sabuni', units: [{ name: 'Carton', priceTzs: 12000 }] })
        .expect(201);

      cartonOnlyId = response.body.id;
      cartonOnlyUnitId = response.body.units[0].id;

      expect(response.body.baseUnitId).toBe(cartonOnlyUnitId);
      expect(response.body.relationships).toEqual([]);
    });

    it('lets the shop sell Cartons before it has ever thought about Pieces', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({ lines: [{ productId: cartonOnlyId, productUnitId: cartonOnlyUnitId, quantity: 3 }] })
        .expect(201);

      const view = await stockService.issueStock(ownerPrincipal, branchId, {
        productId: cartonOnlyId,
        unitId: cartonOnlyUnitId,
        quantity: 1,
      });

      expect(view.packages).toEqual([
        expect.objectContaining({ unitName: 'Carton', quantity: 2 }),
      ]);
    });

    it('adds the Piece only when the shop first needs it', async () => {
      const response = await api()
        .post(`/api/v1/products/${cartonOnlyId}/units`)
        .set(authed(ownerToken))
        .send({
          name: 'Piece',
          priceTzs: 1500,
          relatedUnitId: cartonOnlyUnitId,
          contains: 'NEW',
          factor: 10,
        })
        .expect(201);

      const piece = response.body.units.find((u: { name: string }) => u.name === 'Piece');

      expect(piece.factorToBase).toBe(1);
      expect(response.body.baseUnitId).toBe(piece.id);
    });

    it('re-expresses the stock it already had in the new base unit', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${cartonOnlyId}`)
        .set(authed(ownerToken))
        .expect(200);

      // Still two physical cartons; the arithmetic is now in Pieces.
      expect(response.body.packages).toEqual([
        expect.objectContaining({ unitName: 'Carton', quantity: 2 }),
      ]);
      expect(response.body.normalizedQuantity).toBe(20);
    });

    it('refuses a new unit that would not connect to the product', async () => {
      const other = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Bidhaa Nyingine', units: [{ name: 'Piece' }] })
        .expect(201);

      await api()
        .post(`/api/v1/products/${cartonOnlyId}/units`)
        .set(authed(ownerToken))
        .send({
          name: 'Bale',
          relatedUnitId: other.body.units[0].id,
          contains: 'RELATED',
          factor: 4,
        })
        .expect(404);
    });
  });

  describe('stock that is not there', () => {
    it('refuses to issue more than the branch holds, and changes nothing', async () => {
      const before = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      await expect(
        stockService.issueStock(ownerPrincipal, branchId, {
          productId,
          unitId: pieceId,
          quantity: 9_999,
        }),
      ).rejects.toMatchObject({ status: 409 });

      const after = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(after.body).toEqual(before.body);
    });

    it('refuses to sell a Carton that exists only as loose Pieces', async () => {
      const loose = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Maji 500ml',
          units: [{ name: 'Carton' }, { name: 'Piece' }],
          relationships: [{ parentUnit: 'Carton', childUnit: 'Piece', factor: 6 }],
        })
        .expect(201);

      const carton = loose.body.units.find((u: { name: string }) => u.name === 'Carton');
      const piece = loose.body.units.find((u: { name: string }) => u.name === 'Piece');

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({ lines: [{ productId: loose.body.id, productUnitId: piece.id, quantity: 12 }] })
        .expect(201);

      // Twelve pieces is two cartons' worth — but there is no box, and the
      // engine must not invent one.
      await expect(
        stockService.issueStock(ownerPrincipal, branchId, {
          productId: loose.body.id,
          unitId: carton.id,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });

      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${loose.body.id}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.packages).toEqual([
        expect.objectContaining({ unitName: 'Piece', quantity: 12 }),
      ]);
    });

    it('answers for a product the branch holds none of, rather than 404', async () => {
      const unstocked = await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({ name: 'Bidhaa Isiyo na Hifadhi', units: [{ name: 'Piece' }] })
        .expect(201);

      const response = await api()
        .get(`/api/v1/branches/${branchId}/stock/${unstocked.body.id}`)
        .set(authed(ownerToken))
        .expect(200);

      // "We have none" is a real answer on a selling screen.
      expect(response.body.packages).toEqual([]);
      expect(response.body.normalizedQuantity).toBe(0);
    });
  });

  describe('a delivery is all or nothing', () => {
    it('leaves no stock behind when a later line is invalid', async () => {
      const before = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      const receiptsBefore = await prisma.stockReceipt.count();

      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(ownerToken))
        .send({
          lines: [
            { productId, productUnitId: cartonId, quantity: 4 },
            { productId, productUnitId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
          ],
        })
        .expect(404);

      const after = await api()
        .get(`/api/v1/branches/${branchId}/stock/${productId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(after.body).toEqual(before.body);
      expect(await prisma.stockReceipt.count()).toBe(receiptsBefore);
    });
  });

  describe('barcode lookup', () => {
    it('finds the product by the code that was stored', async () => {
      const response = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.id).toBe(productId);
    });

    it('forgives the spacing a scanner adds', async () => {
      const response = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: ' 590 1234-123457 ' })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.id).toBe(productId);
    });

    it('separates a mis-scan from an unknown item', async () => {
      // A bad check digit is a scanning problem; a good code with no product
      // is a catalogue problem. The person holding the phone needs to know
      // which one they have.
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123456' })
        .set(authed(ownerToken))
        .expect(400);

      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '4006381333931' })
        .set(authed(ownerToken))
        .expect(404);
    });

    it('refuses a barcode already used by another product', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Bidhaa Pacha',
          units: [{ name: 'Piece' }],
          barcode: '5901234123457',
        })
        .expect(409);
    });

    it('refuses a barcode whose check digit is wrong at creation', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerToken))
        .send({
          name: 'Bidhaa yenye Namba Mbovu',
          units: [{ name: 'Piece' }],
          barcode: '5901234123456',
        })
        .expect(400);
    });
  });

  describe('manual search suggestions', () => {
    it('matches part of a name, ignoring case', async () => {
      const response = await api()
        .get('/api/v1/products')
        .query({ query: 'coca' })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).toContain('Coca-Cola 500ml');
    });

    it('matches in the middle of a name, because sellers type fragments', async () => {
      const response = await api()
        .get('/api/v1/products')
        .query({ query: 'cola' })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it('returns an empty list rather than an error when nothing matches', async () => {
      const response = await api()
        .get('/api/v1/products')
        .query({ query: 'kitu-kisichokuwepo' })
        .set(authed(ownerToken))
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('caps how much one request can pull', async () => {
      await api()
        .get('/api/v1/products')
        .query({ limit: 5000 })
        .set(authed(ownerToken))
        .expect(400);
    });
  });

  describe('permissions are enforced on the server', () => {
    let sellerToken: string;
    let stockKeeperToken: string;
    let bystanderToken: string;

    const enrollWorker = async (
      fullName: string,
      permissions: UserPermission[],
    ): Promise<string> => {
      const worker = await api()
        .post('/api/v1/users/workers')
        .set(authed(ownerToken))
        .send({ fullName, password, branchId, permissions })
        .expect(201);

      const issued = await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
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

      return session.body.accessToken;
    };

    beforeAll(async () => {
      sellerToken = await enrollWorker('Muuzaji', [UserPermission.SELL]);
      stockKeeperToken = await enrollWorker('Mhifadhi', [
        UserPermission.RECEIVE_STOCK,
        UserPermission.VIEW_STOCK,
      ]);
      bystanderToken = await enrollWorker('Mtu Tu', []);
    });

    it('lets someone who may receive stock do so', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(stockKeeperToken))
        .send({ lines: [{ productId, productUnitId: cartonId, quantity: 1 }] })
        .expect(201);
    });

    it('refuses a seller receiving stock', async () => {
      await api()
        .post(`/api/v1/branches/${branchId}/stock-receipts`)
        .set(authed(sellerToken))
        .send({ lines: [{ productId, productUnitId: cartonId, quantity: 1 }] })
        .expect(403);
    });

    it('refuses a seller viewing stock without VIEW_STOCK', async () => {
      await api()
        .get(`/api/v1/branches/${branchId}/stock`)
        .set(authed(sellerToken))
        .expect(403);
    });

    it('lets a seller add an unknown product mid-sale', async () => {
      // The flow doc 01 §5 is built around: scan something new, add it, sell it.
      await api()
        .post('/api/v1/products')
        .set(authed(sellerToken))
        .send({ name: 'Bidhaa Mpya Dukani', units: [{ name: 'Piece', priceTzs: 500 }] })
        .expect(201);
    });

    it('lets someone who may receive stock add a product too', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(stockKeeperToken))
        .send({ name: 'Bidhaa ya Mzigo', units: [{ name: 'Piece' }] })
        .expect(201);
    });

    it('refuses someone with no permissions at all', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(bystanderToken))
        .send({ name: 'Bidhaa ya Mtu Tu', units: [{ name: 'Piece' }] })
        .expect(403);
    });

    it('takes a permission away immediately, without waiting for the token to expire', async () => {
      const seller = await prisma.user.findFirstOrThrow({ where: { fullName: 'Muuzaji' } });

      await api()
        .patch(`/api/v1/users/${seller.id}/permissions`)
        .set(authed(ownerToken))
        .send({ permissions: [] })
        .expect(200);

      // Same token, still valid and unexpired — and now refused.
      await api()
        .post('/api/v1/products')
        .set(authed(sellerToken))
        .send({ name: 'Bidhaa Baada ya Kunyang’anywa', units: [{ name: 'Piece' }] })
        .expect(403);
    });

    it('still lets everyone search and look up, which selling depends on', async () => {
      await api().get('/api/v1/products').set(authed(bystanderToken)).expect(200);
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(bystanderToken))
        .expect(200);
    });
  });
});

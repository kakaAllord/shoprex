import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Tenant and branch isolation for the Phase 3 data-bearing resources:
 * `Product`, `ProductUnit`, `Barcode`, `StockReceipt`, `StockMovement`, and
 * `PhysicalStock`.
 *
 * AGENT.md's isolation rule says a resource is checked in the phase that adds
 * it, so Phase 8 confirms rather than discovers. Two tenants, and two branches
 * inside the first, so "another business" and "same business, wrong branch"
 * are proven separately.
 */
describe('Catalogue and stock isolation (e2e)', () => {
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

  const createProduct = async (token: string, name: string, barcode?: string) => {
    const response = await api()
      .post('/api/v1/products')
      .set(authed(token))
      .send({
        name,
        units: [{ name: 'Piece', priceTzs: 1000 }],
        ...(barcode ? { barcode } : {}),
      })
      .expect(201);

    return { id: response.body.id as string, unitId: response.body.units[0].id as string };
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

    ownerAToken = await signupOwner('Duka A', 'owner-a@cat.co.tz', '0717000001');
    ownerBToken = await signupOwner('Duka B', 'owner-b@cat.co.tz', '0717000002');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchA2Id = await createBranch(ownerAToken, 'Tawi A2');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');

    ({ id: productAId, unitId: unitAId } = await createProduct(
      ownerAToken,
      'Bidhaa ya A',
      '5901234123457',
    ));
    ({ id: productBId, unitId: unitBId } = await createProduct(ownerBToken, 'Bidhaa ya B'));

    await api()
      .post(`/api/v1/branches/${branchA1Id}/stock-receipts`)
      .set(authed(ownerAToken))
      .send({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 10 }] })
      .expect(201);

    await api()
      .post(`/api/v1/branches/${branchA2Id}/stock-receipts`)
      .set(authed(ownerAToken))
      .send({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 7 }] })
      .expect(201);

    await api()
      .post(`/api/v1/branches/${branchB1Id}/stock-receipts`)
      .set(authed(ownerBToken))
      .send({ lines: [{ productId: productBId, productUnitId: unitBId, quantity: 5 }] })
      .expect(201);

    await api()
      .post('/api/v1/users/managers')
      .set(authed(ownerAToken))
      .send({
        fullName: 'Meneja A1',
        email: 'meneja-a1@cat.co.tz',
        password,
        branchIds: [branchA1Id],
        permissions: [UserPermission.VIEW_STOCK, UserPermission.RECEIVE_STOCK],
      })
      .expect(201);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'meneja-a1@cat.co.tz', password })
      .expect(200);

    managerA1Token = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('Product — tenant isolation', () => {
    it('lists only the caller’s own catalogue', async () => {
      const response = await api().get('/api/v1/products').set(authed(ownerAToken)).expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).toEqual(['Bidhaa ya A']);
    });

    it('answers 404 for another tenant’s product, never 403', async () => {
      await api()
        .get(`/api/v1/products/${productBId}`)
        .set(authed(ownerAToken))
        .expect(404);
    });

    it('refuses to add a unit to another tenant’s product', async () => {
      await api()
        .post(`/api/v1/products/${productBId}/units`)
        .set(authed(ownerAToken))
        .send({ name: 'Carton', relatedUnitId: unitBId, contains: 'RELATED', factor: 6 })
        .expect(404);
    });

    it('leaves that product untouched after the refusal', async () => {
      const units = await prisma.productUnit.findMany({ where: { productId: productBId } });

      expect(units.map((unit) => unit.name)).toEqual(['Piece']);
    });

    it('lets two businesses use the same product name independently', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(ownerBToken))
        .send({ name: 'Bidhaa ya A', units: [{ name: 'Piece' }] })
        .expect(201);
    });
  });

  describe('Barcode — tenant isolation', () => {
    it('does not find another tenant’s barcode', async () => {
      await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(ownerBToken))
        .expect(404);
    });

    it('lets a second business use the very same barcode for its own product', async () => {
      // Two shops stocking the same item is normal; the code is unique per
      // tenant, not globally.
      const response = await api()
        .post('/api/v1/products')
        .set(authed(ownerBToken))
        .send({
          name: 'Coca-Cola 500ml',
          units: [{ name: 'Piece' }],
          barcode: '5901234123457',
        })
        .expect(201);

      expect(response.body.barcodes).toEqual(['5901234123457']);
    });

    it('still resolves each tenant’s code to its own product', async () => {
      const a = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(ownerAToken))
        .expect(200);

      const b = await api()
        .get('/api/v1/products/lookup')
        .query({ barcode: '5901234123457' })
        .set(authed(ownerBToken))
        .expect(200);

      expect(a.body.name).toBe('Bidhaa ya A');
      expect(b.body.name).toBe('Coca-Cola 500ml');
    });
  });

  describe('PhysicalStock — branch isolation', () => {
    it('keeps each branch’s holding separate', async () => {
      const a1 = await api()
        .get(`/api/v1/branches/${branchA1Id}/stock/${productAId}`)
        .set(authed(ownerAToken))
        .expect(200);

      const a2 = await api()
        .get(`/api/v1/branches/${branchA2Id}/stock/${productAId}`)
        .set(authed(ownerAToken))
        .expect(200);

      expect(a1.body.normalizedQuantity).toBe(10);
      expect(a2.body.normalizedQuantity).toBe(7);
    });

    it('answers 404 for a branch in another tenant', async () => {
      await api()
        .get(`/api/v1/branches/${branchB1Id}/stock`)
        .set(authed(ownerAToken))
        .expect(404);
    });

    it('refuses to receive stock into another tenant’s branch', async () => {
      await api()
        .post(`/api/v1/branches/${branchB1Id}/stock-receipts`)
        .set(authed(ownerAToken))
        .send({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 3 }] })
        .expect(404);
    });

    it('leaves the other tenant’s stock exactly as it was', async () => {
      const response = await api()
        .get(`/api/v1/branches/${branchB1Id}/stock/${productBId}`)
        .set(authed(ownerBToken))
        .expect(200);

      expect(response.body.normalizedQuantity).toBe(5);
    });

    it('refuses to receive another tenant’s product into its own branch', async () => {
      await api()
        .post(`/api/v1/branches/${branchA1Id}/stock-receipts`)
        .set(authed(ownerAToken))
        .send({ lines: [{ productId: productBId, productUnitId: unitBId, quantity: 3 }] })
        .expect(404);
    });
  });

  describe('a manager reaches only their own branch', () => {
    it('reads stock in the branch they are assigned to', async () => {
      await api()
        .get(`/api/v1/branches/${branchA1Id}/stock`)
        .set(authed(managerA1Token))
        .expect(200);
    });

    it('answers 404 for a branch of the same business they are not assigned to', async () => {
      await api()
        .get(`/api/v1/branches/${branchA2Id}/stock`)
        .set(authed(managerA1Token))
        .expect(404);
    });

    it('cannot receive stock into that other branch either', async () => {
      await api()
        .post(`/api/v1/branches/${branchA2Id}/stock-receipts`)
        .set(authed(managerA1Token))
        .send({ lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }] })
        .expect(404);
    });

    it('sees the whole business catalogue, because products are not branch-scoped', async () => {
      const response = await api()
        .get('/api/v1/products')
        .set(authed(managerA1Token))
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('StockMovement and StockReceipt — tenant isolation', () => {
    it('binds every movement to the branch and business it happened in', async () => {
      const businessA = await prisma.business.findFirstOrThrow({ where: { name: 'Duka A' } });
      const movements = await prisma.stockMovement.findMany({
        where: { businessId: businessA.id },
      });

      expect(movements.length).toBeGreaterThan(0);
      expect(movements.every((m) => [branchA1Id, branchA2Id].includes(m.branchId))).toBe(true);
    });

    it('never lets a receipt reference a product from another business', async () => {
      const lines = await prisma.stockReceiptLine.findMany({
        include: { receipt: true, product: true },
      });

      expect(lines.length).toBeGreaterThan(0);
      expect(
        lines.every((line) => line.product.businessId === line.receipt.businessId),
      ).toBe(true);
    });

    it('attributes each receipt to the person who recorded it', async () => {
      const receipts = await prisma.stockReceipt.findMany({ include: { receivedBy: true } });

      expect(receipts.length).toBeGreaterThan(0);
      expect(receipts.every((receipt) => receipt.receivedById.length > 0)).toBe(true);
    });
  });

  describe('a platform administrator is not a tenant', () => {
    let adminToken: string;

    beforeAll(async () => {
      const owner = await prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } });
      const admin = await prisma.user.create({
        data: {
          email: 'admin@cat.co.tz',
          passwordHash: owner.passwordHash,
          fullName: 'Msimamizi',
          role: 'PLATFORM_ADMIN',
        },
      });

      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: admin.email!, password })
        .expect(200);

      adminToken = login.body.accessToken;
    });

    it('cannot list products, because it belongs to no business', async () => {
      await api().get('/api/v1/products').set(authed(adminToken)).expect(403);
    });

    it('cannot create a product', async () => {
      await api()
        .post('/api/v1/products')
        .set(authed(adminToken))
        .send({ name: 'Bidhaa ya Admin', units: [{ name: 'Piece' }] })
        .expect(403);
    });

    it('cannot read a branch’s stock', async () => {
      await api()
        .get(`/api/v1/branches/${branchA1Id}/stock`)
        .set(authed(adminToken))
        .expect(403);
    });
  });

  describe('no request body may carry a tenant', () => {
    it('rejects a businessId smuggled into product creation', async () => {
      const businessB = await prisma.business.findFirstOrThrow({ where: { name: 'Duka B' } });

      await api()
        .post('/api/v1/products')
        .set(authed(ownerAToken))
        .send({
          name: 'Bidhaa ya Kuiba',
          units: [{ name: 'Piece' }],
          businessId: businessB.id,
        })
        .expect(400);
    });

    it('rejects a branchId smuggled into a stock receipt', async () => {
      await api()
        .post(`/api/v1/branches/${branchA1Id}/stock-receipts`)
        .set(authed(ownerAToken))
        .send({
          lines: [{ productId: productAId, productUnitId: unitAId, quantity: 1 }],
          branchId: branchB1Id,
        })
        .expect(400);
    });
  });
});

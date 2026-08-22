import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Owner self-registration: a shopkeeper creates their own account and shop
 * without a platform administrator, and is signed in immediately.
 */
describe('Owner signup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';

  const signup = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/auth/signup').send(body);

  beforeAll(async () => {
    prisma = new PrismaClient();

    await prisma.branchAssignment.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates the shop and the owner together and returns a session', async () => {
    const response = await signup({
      shopName: 'Duka la Mama Anna',
      email: 'mama.anna@shoprex.co.tz',
      phone: '0712345678',
      password,
      fullName: 'Mama Anna',
    }).expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.role).toBe(UserRole.OWNER);
    expect(response.body.user.console).toBe('owner');
    expect(response.body.user.businessName).toBe('Duka la Mama Anna');
    expect(response.body.user.passwordHash).toBeUndefined();

    const business = await prisma.business.findFirst({
      where: { name: 'Duka la Mama Anna' },
    });

    expect(business).not.toBeNull();
    expect(business?.timezone).toBe('Africa/Dar_es_Salaam');
  });

  it('stores the phone number in one canonical form', async () => {
    const user = await prisma.user.findUnique({ where: { email: 'mama.anna@shoprex.co.tz' } });

    expect(user?.phone).toBe('+255712345678');
  });

  it('signs the new owner in with the password they chose', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'mama.anna@shoprex.co.tz', password })
      .expect(200);

    expect(response.body.user.console).toBe('owner');
  });

  it('gives the new owner their own business and no one else', async () => {
    const session = await signup({
      shopName: 'Duka la Baba Juma',
      email: 'baba.juma@shoprex.co.tz',
      phone: '0713111222',
      password,
    }).expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/businesses/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .expect(200);

    expect(response.body.name).toBe('Duka la Baba Juma');
  });

  it('defaults the display name to the email name when none is given', async () => {
    const user = await prisma.user.findUnique({ where: { email: 'baba.juma@shoprex.co.tz' } });

    expect(user?.fullName).toBe('baba.juma');
  });

  it('refuses a second account on the same email', async () => {
    await signup({
      shopName: 'Duka jingine',
      email: 'mama.anna@shoprex.co.tz',
      phone: '0714999888',
      password,
    }).expect(409);
  });

  it('refuses a second account on the same phone, however it is written', async () => {
    const response = await signup({
      shopName: 'Duka jingine',
      email: 'someone.else@shoprex.co.tz',
      phone: '+255 712 345 678',
      password,
    }).expect(409);

    expect(String(response.body.message)).toContain('simu');
  });

  it.each([
    ['a non-Tanzanian number', '+254712345678'],
    ['too few digits', '071234567'],
    ['a landline-style prefix', '0812345678'],
    ['letters', 'not-a-phone'],
  ])('rejects %s', async (_label, phone) => {
    await signup({
      shopName: 'Duka la Majaribio',
      email: `phone-${Math.random().toString(36).slice(2, 8)}@shoprex.co.tz`,
      phone,
      password,
    }).expect(400);
  });

  it('rejects a short password', async () => {
    await signup({
      shopName: 'Duka la Majaribio',
      email: 'short.password@shoprex.co.tz',
      phone: '0715222333',
      password: 'short',
    }).expect(400);
  });

  it('rejects an attempt to self-assign a role', async () => {
    await signup({
      shopName: 'Duka la Majaribio',
      email: 'sneaky.role@shoprex.co.tz',
      phone: '0716333444',
      password,
      role: 'PLATFORM_ADMIN',
    }).expect(400);
  });
});

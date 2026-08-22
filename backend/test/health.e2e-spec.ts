import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/database/prisma.service';

/**
 * Boots the real HTTP surface with PostgreSQL stubbed out, so the health
 * contract is verified without requiring a running database in CI.
 */
describe('Health endpoints (e2e)', () => {
  let app: INestApplication;
  const ping = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://shoprex:shoprex_local_password@localhost:5432/shoprex?schema=public';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ ping, $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('shoprex-backend');
  });

  it('GET /api/v1/health/ready returns 200 when the database answers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect(response.body.database.status).toBe('ok');
  });

  it('GET /api/v1/health/ready returns 503 when the database is unreachable', async () => {
    ping.mockRejectedValueOnce(new Error('connection refused'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body.database.status).toBe('error');
  });

  it('returns the shared Shoprex error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/api/v1/does-not-exist',
    });
    expect(response.body.timestamp).toBeDefined();
  });
});

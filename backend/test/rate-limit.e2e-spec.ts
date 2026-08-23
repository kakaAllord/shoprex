import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Password guessing must be throttled: a shop password is short and a login
 * endpoint with no limit is brute-forceable.
 *
 * The limits are read from configuration when the module is built, so this
 * suite lowers them before importing the application module.
 */
describe('Authentication rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const authLimit = 4;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH = String(authLimit);
    process.env.RATE_LIMIT_DEFAULT = '1000';
    process.env.RATE_LIMIT_TTL_MS = '60000';

    // Imported after the limits are set, so the throttler picks them up.
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('blocks repeated sign-in attempts with 429 once the limit is passed', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'brute.force@shoprex.co.tz', password: 'guess-guess' });

    const statuses: number[] = [];

    for (let i = 0; i < authLimit + 2; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses.slice(0, authLimit)).toEqual(Array(authLimit).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('blocks repeated device sign-in attempts too', async () => {
    // A worker's password is guessable in exactly the same way an owner's is,
    // and the device id is not a secret — it is stored on the phone. So the
    // device sign-in belongs in the strict bucket, not the generous one.
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/device/login')
        .send({
          deviceId: '00000000-0000-4000-8000-000000000000',
          userId: '00000000-0000-4000-8000-000000000001',
          password: 'guess-guess',
        });

    const statuses: number[] = [];

    for (let i = 0; i < authLimit + 2; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses.slice(0, authLimit)).toEqual(Array(authLimit).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('blocks repeated enrollment-code guesses', async () => {
    // An enrollment code is a short secret typed by hand. It is public — a
    // phone with no credentials has to be able to redeem one — so throttling
    // is what stands between it and being guessed at scale.
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/devices/enroll')
        .send({ code: 'ZZZZ-ZZZZ-ZZZZ' });

    const statuses: number[] = [];

    for (let i = 0; i < authLimit + 2; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses.slice(0, authLimit)).toEqual(Array(authLimit).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('does not throttle ordinary endpoints at the sign-in limit', async () => {
    // The health route opts out of the strict bucket, so it still answers
    // after the auth bucket for this client is exhausted.
    for (let i = 0; i < authLimit + 3; i += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });
});

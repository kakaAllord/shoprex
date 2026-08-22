import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceStatus, PrismaClient, UserPermission, UserRole } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 2's acceptance check, end to end: an owner creates a branch, a worker,
 * and an enrollment code; a phone redeems it; the worker signs in on that
 * phone; the owner sees the actor and the device on the action; the owner
 * revokes the phone and it is refused immediately.
 *
 * Also the three rules the owner confirmed on 2026-08-22 and PROGRESS §2
 * records: a code cannot be reused, cannot be used after expiry, and a worker
 * who already holds an active device is refused a second one — without the
 * refusal burning the code.
 */
describe('Device enrollment, sign-in, and revocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());

  let ownerToken: string;
  let branchId: string;
  let workerId: string;

  const issueCode = async (userId: string, expiresInMinutes?: number) => {
    const response = await api()
      .post('/api/v1/devices/enrollments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId, ...(expiresInMinutes ? { expiresInMinutes } : {}) })
      .expect(201);

    return response.body as { enrollmentId: string; code: string; expiresAt: string };
  };

  const createWorker = async (fullName: string): Promise<string> => {
    const response = await api()
      .post('/api/v1/users/workers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName, password, branchId, permissions: [UserPermission.SELL] })
      .expect(201);

    return response.body.id as string;
  };

  beforeAll(async () => {
    // Enrollment redemption and device sign-in both sit in the strict auth
    // rate-limit bucket, which backend/.env sets to 10 a minute — correct in
    // production and far too low for a suite that enrolls a dozen phones. The
    // limits are read when the module is built, so they are raised before the
    // import, the same way rate-limit.e2e-spec.ts lowers them. That the bucket
    // really does cover these two routes is proven there, not here.
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
        shopName: 'Duka la Kariakoo',
        email: 'owner@kariakoo.co.tz',
        phone: '0712000010',
        password,
        fullName: 'Mmiliki Kariakoo',
      })
      .expect(201);

    ownerToken = signup.body.accessToken;

    const branch = await api()
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Tawi la Kariakoo' })
      .expect(201);

    branchId = branch.body.id;
    workerId = await createWorker('Juma Hassan');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('the owner issues a one-time code', () => {
    it('returns the code exactly once, in readable groups', async () => {
      const issued = await issueCode(workerId);

      expect(issued.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      expect(issued.enrollmentId).toBeTruthy();
    });

    it('stores only a hash — the code itself is never in the database', async () => {
      const issued = await issueCode(workerId);
      const row = await prisma.deviceEnrollmentToken.findUnique({
        where: { id: issued.enrollmentId },
      });

      expect(row?.tokenHash).toHaveLength(64);
      expect(row?.tokenHash).not.toContain(issued.code.replace(/-/g, ''));
    });

    it('keeps the code out of the audit log', async () => {
      const issued = await issueCode(workerId);
      const events = await prisma.auditEvent.findMany({
        where: { action: 'DEVICE_ENROLLMENT_ISSUED' },
      });

      expect(events.length).toBeGreaterThan(0);
      expect(
        events.some((event) => event.summary.includes(issued.code.replace(/-/g, ''))),
      ).toBe(false);
    });

    it('takes the branch from the worker’s own assignment, not the request', async () => {
      const issued = await issueCode(workerId);
      const row = await prisma.deviceEnrollmentToken.findUnique({
        where: { id: issued.enrollmentId },
      });

      expect(row?.branchId).toBe(branchId);
    });

    it('refuses a branchId supplied in the body', async () => {
      await api()
        .post('/api/v1/devices/enrollments')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: workerId, branchId })
        .expect(400);
    });

    it('refuses to issue for a user who is not a worker in this business', async () => {
      const owner = await prisma.user.findFirst({ where: { role: UserRole.OWNER } });

      await api()
        .post('/api/v1/devices/enrollments')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: owner!.id })
        .expect(404);
    });
  });

  describe('a phone redeems the code', () => {
    let code: string;
    let deviceId: string;

    beforeAll(async () => {
      await prisma.deviceEnrollmentToken.deleteMany();
      ({ code } = await issueCode(workerId));
    });

    it('binds the installation to one business, branch, and worker', async () => {
      const response = await api()
        .post('/api/v1/devices/enroll')
        .send({ code })
        .expect(200);

      deviceId = response.body.deviceId;

      expect(response.body).toMatchObject({
        deviceName: 'Juma Hassan',
        branchId,
        workerId,
        workerName: 'Juma Hassan',
        businessName: 'Duka la Kariakoo',
      });
    });

    it('mints the device id server-side rather than accepting one', async () => {
      expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);

      await api()
        .post('/api/v1/devices/enroll')
        .send({ code, deviceId: 'a-device-id-i-chose-myself' })
        .expect(400);
    });

    it('names the device after the worker, so the owner knows whose phone it is', async () => {
      const device = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(device?.name).toBe('Juma Hassan');
      expect(device?.status).toBe(DeviceStatus.ACTIVE);
    });

    it('stamps enrollment with the backend clock', async () => {
      const device = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(device?.createdAt).toBeInstanceOf(Date);
      expect(device?.lastSeenAt).toBeInstanceOf(Date);
    });

    it('refuses the same code a second time', async () => {
      await api().post('/api/v1/devices/enroll').send({ code }).expect(401);
    });

    it('forgives lower case and missing dashes on a code that is still valid', async () => {
      const second = await createWorker('Asha Kimaro');
      const issued = await issueCode(second);

      await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issued.code.toLowerCase().replace(/-/g, '') })
        .expect(200);
    });

    it('answers 401 for a code that never existed', async () => {
      await api().post('/api/v1/devices/enroll').send({ code: 'ZZZZ-ZZZZ-ZZZZ' }).expect(401);
    });

    it('answers 400 for something that is not a code at all', async () => {
      await api().post('/api/v1/devices/enroll').send({ code: 'nope' }).expect(400);
    });
  });

  describe('a code cannot be used after it expires', () => {
    it('refuses one whose expiry has passed', async () => {
      const worker = await createWorker('Salma Ally');
      const issued = await issueCode(worker, 5);

      // The expiry is a stored backend timestamp, so the test moves the stored
      // value rather than the client's clock — a device clock is exactly what
      // must not be able to influence this.
      await prisma.deviceEnrollmentToken.update({
        where: { id: issued.enrollmentId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await api().post('/api/v1/devices/enroll').send({ code: issued.code }).expect(401);
    });

    it('does not create a device when the code has expired', async () => {
      const salma = await prisma.user.findFirst({ where: { fullName: 'Salma Ally' } });
      const devices = await prisma.device.findMany({ where: { userId: salma!.id } });

      expect(devices).toEqual([]);
    });
  });

  describe('re-enrolling a worker who already holds a device', () => {
    let worker: string;
    let firstDeviceId: string;
    let secondCode: string;

    beforeAll(async () => {
      worker = await createWorker('Neema Mushi');

      const first = await issueCode(worker);
      const enrolled = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: first.code })
        .expect(200);

      firstDeviceId = enrolled.body.deviceId;
      secondCode = (await issueCode(worker)).code;
    });

    it('refuses the second enrollment while the first device is active', async () => {
      const response = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: secondCode })
        .expect(409);

      // The owner has to know *which* phone to revoke, and the worker standing
      // in the shop has to know why it failed.
      expect(response.body.message).toContain('Neema Mushi');
    });

    it('does not consume the code when it refuses, so the worker is not stranded', async () => {
      const row = await prisma.deviceEnrollmentToken.findFirst({
        where: { userId: worker, usedAt: null },
      });

      expect(row).not.toBeNull();
    });

    it('does not silently move the worker to the new phone', async () => {
      const devices = await prisma.device.findMany({ where: { userId: worker } });

      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe(firstDeviceId);
    });

    it('accepts the same code once the owner revokes the first device', async () => {
      await api()
        .post(`/api/v1/devices/${firstDeviceId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const response = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: secondCode })
        .expect(200);

      expect(response.body.deviceId).not.toBe(firstDeviceId);
    });

    it('leaves the revoked device in place rather than deleting the history', async () => {
      const first = await prisma.device.findUnique({ where: { id: firstDeviceId } });

      expect(first?.status).toBe(DeviceStatus.REVOKED);
      expect(first?.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('the worker signs in on their enrolled phone', () => {
    let deviceId: string;
    let deviceToken: string;
    let workerOnPhone: string;

    beforeAll(async () => {
      workerOnPhone = await createWorker('Baraka Joseph');
      const issued = await issueCode(workerOnPhone);
      const enrolled = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issued.code })
        .expect(200);

      deviceId = enrolled.body.deviceId;
    });

    it('signs in with the device id and the worker’s password — no code', async () => {
      const response = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, password })
        .expect(200);

      deviceToken = response.body.accessToken;

      expect(response.body.user).toMatchObject({
        id: workerOnPhone,
        role: UserRole.WORKER,
        email: null,
        deviceId,
        branchIds: [branchId],
        permissions: [UserPermission.SELL],
      });
    });

    it('carries the device on the session, so later actions are attributable', async () => {
      const response = await api()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${deviceToken}`)
        .expect(200);

      expect(response.body.deviceId).toBe(deviceId);
    });

    it('rejects a wrong password with the same answer as an unknown device', async () => {
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, password: 'wrong-password-here' })
        .expect(401);

      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: '00000000-0000-4000-8000-000000000000', password })
        .expect(401);
    });

    it('updates last seen from the backend clock at sign-in', async () => {
      const before = await prisma.device.findUnique({ where: { id: deviceId } });

      await api().post('/api/v1/auth/device/login').send({ deviceId, password }).expect(200);

      const after = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(after!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
        before!.lastSeenAt!.getTime(),
      );
    });

    describe('and then the owner revokes it', () => {
      it('refuses the device on its very next request, with the token unchanged', async () => {
        // The token is still cryptographically valid and unexpired: this is
        // the point. Revocation must bite at the backend, not wait for expiry
        // and not rely on the app hiding a screen.
        await api()
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${deviceToken}`)
          .expect(200);

        await api()
          .post(`/api/v1/devices/${deviceId}/revoke`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);

        await api()
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${deviceToken}`)
          .expect(401);
      });

      it('refuses a fresh sign-in on the revoked device too', async () => {
        await api().post('/api/v1/auth/device/login').send({ deviceId, password }).expect(401);
      });

      it('refuses to revoke the same device twice', async () => {
        await api()
          .post(`/api/v1/devices/${deviceId}/revoke`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(409);
      });

      it('leaves the owner’s own session working', async () => {
        await api()
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
      });
    });
  });

  describe('the owner sees the actor and device on a test action', () => {
    it('attributes the device sign-in to both the worker and their phone', async () => {
      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const signIn = response.body.find(
        (event: { action: string }) => event.action === 'DEVICE_SIGNED_IN',
      );

      expect(signIn).toBeDefined();
      expect(signIn.actorUserId).toBeTruthy();
      expect(signIn.actorName).toBeTruthy();
      expect(signIn.actorRole).toBe(UserRole.WORKER);
      expect(signIn.deviceId).toBeTruthy();
      expect(signIn.createdAt).toBeTruthy();
    });

    it('records the whole Phase 2 flow, not just the sign-in', async () => {
      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ limit: 200 })
        .expect(200);

      const actions = new Set(response.body.map((event: { action: string }) => event.action));

      expect(actions).toContain('WORKER_CREATED');
      expect(actions).toContain('DEVICE_ENROLLMENT_ISSUED');
      expect(actions).toContain('DEVICE_ENROLLED');
      expect(actions).toContain('DEVICE_SIGNED_IN');
      expect(actions).toContain('DEVICE_REVOKED');
    });

    it('names the owner as the actor on a revocation, with no device', async () => {
      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ limit: 200 })
        .expect(200);

      const revoked = response.body.find(
        (event: { action: string }) => event.action === 'DEVICE_REVOKED',
      );

      expect(revoked.actorRole).toBe(UserRole.OWNER);
      expect(revoked.deviceId).toBeNull();
      expect(revoked.targetType).toBe('Device');
    });

    it('can be narrowed to one device', async () => {
      const device = await prisma.device.findFirst({ where: { status: DeviceStatus.ACTIVE } });

      const response = await api()
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ deviceId: device!.id })
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(
        response.body.every((event: { deviceId: string }) => event.deviceId === device!.id),
      ).toBe(true);
    });
  });
});

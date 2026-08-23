import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceStatus, PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { hashEnrollmentCode } from '../src/domain/enrollment-token';

/**
 * Device enrollment, shared sign-in, and revocation.
 *
 * **A device belongs to a branch, not to a worker** (owner's decision,
 * 2026-08-23 — PROGRESS.md §2a). The owner enrols a handset to a branch, and
 * anyone who works at that branch signs in on it with their own password. A
 * flat battery no longer stops a shift.
 *
 * Because the handset no longer identifies anybody, sign-in has to: the caller
 * names the person and proves it with that person's password. The tests below
 * are mostly about the boundary that replaced "one device, one worker" — the
 * **branch**.
 */
describe('Device enrollment, shared sign-in, and revocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  let ownerToken: string;
  let ownerId: string;
  let counterBranchId: string;
  let storeBranchId: string;

  let jumaId: string;
  let neemaId: string;
  let storeWorkerId: string;

  const issueCode = async (branchId: string, deviceName: string, expiresInMinutes?: number) => {
    const response = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerToken))
      .send({ branchId, deviceName, ...(expiresInMinutes ? { expiresInMinutes } : {}) })
      .expect(201);

    return response.body as {
      enrollmentId: string;
      code: string;
      expiresAt: string;
      deviceName: string;
      branchId: string;
      branchName: string;
    };
  };

  const enrol = async (branchId: string, deviceName: string): Promise<string> => {
    const { code } = await issueCode(branchId, deviceName);
    const response = await api().post('/api/v1/devices/enroll').send({ code }).expect(200);

    return response.body.deviceId as string;
  };

  const createWorker = async (fullName: string, branchId: string): Promise<string> => {
    const response = await api()
      .post('/api/v1/users/workers')
      .set(authed(ownerToken))
      .send({ fullName, password, branchId, permissions: [UserPermission.SELL] })
      .expect(201);

    return response.body.id as string;
  };

  beforeAll(async () => {
    // Enrollment redemption and device sign-in both sit in the strict auth
    // rate-limit bucket, which backend/.env sets to 10 a minute — correct in
    // production and far too low for a suite that enrols a dozen phones. The
    // limits are read when the module is built, so they are raised before the
    // import, the same way rate-limit.e2e-spec.ts lowers them.
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
        shopName: 'Duka la Kariakoo',
        email: 'owner@kariakoo.co.tz',
        phone: '0712000010',
        password,
        fullName: 'Mmiliki Kariakoo',
      })
      .expect(201);

    ownerToken = signup.body.accessToken;
    ownerId = signup.body.user.id;

    counterBranchId = (
      await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Tawi la Kariakoo' })
        .expect(201)
    ).body.id;

    storeBranchId = (
      await api()
        .post('/api/v1/branches')
        .set(authed(ownerToken))
        .send({ name: 'Ghala' })
        .expect(201)
    ).body.id;

    jumaId = await createWorker('Juma Hassan', counterBranchId);
    neemaId = await createWorker('Neema Said', counterBranchId);
    storeWorkerId = await createWorker('Baraka Ghala', storeBranchId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('the owner issues a one-time code for a branch', () => {
    it('returns the code exactly once, in readable groups', async () => {
      const issued = await issueCode(counterBranchId, 'Simu ya kaunta');

      expect(issued.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      expect(issued.branchName).toBe('Tawi la Kariakoo');
      expect(issued.deviceName).toBe('Simu ya kaunta');
    });

    it('stores only a hash — the code itself is never in the database', async () => {
      const issued = await issueCode(counterBranchId, 'Simu ya pili');

      const row = await prisma.deviceEnrollmentToken.findUnique({
        where: { id: issued.enrollmentId },
      });

      // The canonical form is the grouped one the owner reads aloud, dashes
      // and all — normalizeEnrollmentCode returns that, so it is what is hashed.
      expect(row?.tokenHash).toBe(hashEnrollmentCode(issued.code));
      expect(row?.tokenHash).not.toContain(issued.code.replace(/-/g, ''));
    });

    it('keeps the code out of the audit log', async () => {
      const issued = await issueCode(counterBranchId, 'Simu ya tatu');

      const events = (
        await api().get('/api/v1/audit-events').set(authed(ownerToken)).expect(200)
      ).body as Array<{ summary: string }>;

      expect(
        events.some((event) => event.summary.includes(issued.code.replace(/-/g, ''))),
      ).toBe(false);
    });

    it('names the branch in the body, and checks it belongs to this business', async () => {
      // The branch is what a code binds now, so it *is* in the request body —
      // one of the few DTOs allowed to name a branch. The pinning in
      // openapi.e2e-spec.ts requires a cross-tenant test to back that, and
      // this is it: another owner's branch answers 404, never 403.
      const other = await api()
        .post('/api/v1/auth/signup')
        .send({
          shopName: 'Duka Jingine',
          email: 'owner@jingine.co.tz',
          phone: '0712000019',
          password,
          fullName: 'Mmiliki Jingine',
        })
        .expect(201);

      const theirBranch = (
        await api()
          .post('/api/v1/branches')
          .set(authed(other.body.accessToken))
          .send({ name: 'Tawi Lao' })
          .expect(201)
      ).body.id;

      await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId: theirBranch, deviceName: 'Simu ya wizi' })
        .expect(404);

      expect(await prisma.deviceEnrollmentToken.count({ where: { branchId: theirBranch } })).toBe(
        0,
      );
    });

    it('no longer accepts a userId — a code binds a phone, not a person', async () => {
      await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId: counterBranchId, deviceName: 'Simu', userId: jumaId })
        .expect(400);
    });

    it('needs a name for the phone, so the owner can tell handsets apart', async () => {
      await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerToken))
        .send({ branchId: counterBranchId })
        .expect(400);
    });
  });

  describe('a phone redeems the code', () => {
    let code: string;
    let deviceId: string;

    beforeAll(async () => {
      ({ code } = await issueCode(counterBranchId, 'Simu ya kaunta 1'));
    });

    it('binds the installation to one business and one branch', async () => {
      const response = await api()
        .post('/api/v1/devices/enroll')
        .send({ code })
        .expect(200);

      deviceId = response.body.deviceId;

      expect(response.body).toMatchObject({
        deviceName: 'Simu ya kaunta 1',
        businessName: 'Duka la Kariakoo',
        branchId: counterBranchId,
        branchName: 'Tawi la Kariakoo',
      });
    });

    it('names nobody — the phone is not a person', async () => {
      const response = await api()
        .get(`/api/v1/devices/${deviceId}`)
        .set(authed(ownerToken))
        .expect(200);

      expect(Object.keys(response.body)).not.toContain('userId');
      expect(Object.keys(response.body)).not.toContain('workerName');
      expect(response.body.branchName).toBe('Tawi la Kariakoo');
    });

    it('mints the device id server-side rather than accepting one', async () => {
      const issued = await issueCode(counterBranchId, 'Simu nyingine');

      expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);

      await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issued.code, deviceId: 'a-device-id-i-chose-myself' })
        .expect(400);
    });

    it('stamps enrollment with the backend clock', async () => {
      const device = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(Math.abs(Date.now() - (device?.createdAt.getTime() ?? 0))).toBeLessThan(60_000);
    });

    it('refuses the same code a second time', async () => {
      await api().post('/api/v1/devices/enroll').send({ code }).expect(401);
    });

    it('forgives lower case and missing dashes on a code that is still valid', async () => {
      const issued = await issueCode(counterBranchId, 'Simu ya herufi ndogo');

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
      const issued = await issueCode(counterBranchId, 'Simu ya muda', 5);

      await prisma.deviceEnrollmentToken.update({
        where: { id: issued.enrollmentId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await api().post('/api/v1/devices/enroll').send({ code: issued.code }).expect(401);
    });

    it('does not create a device when the code has expired', async () => {
      const spent = await prisma.deviceEnrollmentToken.findFirst({
        where: { deviceName: 'Simu ya muda' },
      });

      expect(spent?.usedAt).toBeNull();
      expect(spent?.deviceId).toBeNull();
    });
  });

  describe('a branch may hold several phones', () => {
    it('enrols a second handset at the same branch without complaint', async () => {
      // The old model refused this: one worker, one device. A shop with a
      // counter phone and a back-room phone is ordinary, and now it works.
      const first = await enrol(counterBranchId, 'Simu A');
      const second = await enrol(counterBranchId, 'Simu B');

      expect(first).not.toBe(second);

      const devices = await prisma.device.findMany({
        where: { branchId: counterBranchId, status: DeviceStatus.ACTIVE },
      });

      expect(devices.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('several people share one phone', () => {
    let deviceId: string;

    beforeAll(async () => {
      deviceId = await enrol(counterBranchId, 'Simu ya kushirikiana');
    });

    it('offers the people who work at that branch, and the owner', async () => {
      const response = await api()
        .get(`/api/v1/auth/device/${deviceId}/people`)
        .expect(200);

      const names = (response.body as Array<{ fullName: string }>).map((p) => p.fullName);

      expect(names).toContain('Juma Hassan');
      expect(names).toContain('Neema Said');
      // The owner reaches every branch of their own business.
      expect(names).toContain('Mmiliki Kariakoo');
      // Somebody who works at the other branch does not appear.
      expect(names).not.toContain('Baraka Ghala');
    });

    it('gives out names and ids and nothing else', async () => {
      const response = await api()
        .get(`/api/v1/auth/device/${deviceId}/people`)
        .expect(200);

      for (const person of response.body as Array<Record<string, unknown>>) {
        expect(Object.keys(person).sort()).toEqual(['fullName', 'userId']);
      }
    });

    it('lets the first worker sign in with their own password', async () => {
      const response = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: jumaId, password })
        .expect(200);

      expect(response.body.user.id).toBe(jumaId);
      expect(response.body.user.deviceId).toBe(deviceId);
    });

    it('lets a second worker sign in on the very same phone', async () => {
      // The whole point of the change: Juma's phone is flat, so Neema picks up
      // the counter handset and carries on.
      const response = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: neemaId, password })
        .expect(200);

      expect(response.body.user.id).toBe(neemaId);
      expect(response.body.user.fullName).toBe('Neema Said');
    });

    it('lets the owner sign in at the counter too', async () => {
      const response = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: ownerId, password })
        .expect(200);

      expect(response.body.user.role).toBe('OWNER');
    });

    it('refuses somebody who works at a different branch', async () => {
      // Same business, correct password, wrong counter. The branch is the
      // boundary that replaced one-device-one-worker, so it has to hold.
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: storeWorkerId, password })
        .expect(401);
    });

    it('refuses a wrong password with the same answer as an unknown person', async () => {
      const wrongPassword = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: jumaId, password: 'not-the-password' })
        .expect(401);

      const unknownPerson = await api()
        .post('/api/v1/auth/device/login')
        .send({
          deviceId,
          userId: '00000000-0000-4000-8000-000000000000',
          password,
        })
        .expect(401);

      expect(unknownPerson.body.message).toBe(wrongPassword.body.message);
    });

    it('updates last seen from the backend clock at sign-in', async () => {
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: jumaId, password })
        .expect(200);

      const device = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(Math.abs(Date.now() - (device?.lastSeenAt?.getTime() ?? 0))).toBeLessThan(60_000);
    });
  });

  describe('the owner revokes a phone', () => {
    let deviceId: string;
    let token: string;

    beforeAll(async () => {
      deviceId = await enrol(counterBranchId, 'Simu ya kufutwa');
      token = (
        await api()
          .post('/api/v1/auth/device/login')
          .send({ deviceId, userId: jumaId, password })
          .expect(200)
      ).body.accessToken;

      await api()
        .post(`/api/v1/devices/${deviceId}/revoke`)
        .set(authed(ownerToken))
        .expect(200);
    });

    it('refuses the device on its very next request, with the token unchanged', async () => {
      await api().get('/api/v1/auth/me').set(authed(token)).expect(401);
    });

    it('refuses a fresh sign-in on the revoked device too', async () => {
      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: jumaId, password })
        .expect(401);
    });

    it('will not even say who works there any more', async () => {
      await api().get(`/api/v1/auth/device/${deviceId}/people`).expect(401);
    });

    it('refuses to revoke the same device twice', async () => {
      await api()
        .post(`/api/v1/devices/${deviceId}/revoke`)
        .set(authed(ownerToken))
        .expect(409);
    });

    it('leaves the revoked device in place rather than deleting the history', async () => {
      const device = await prisma.device.findUnique({ where: { id: deviceId } });

      expect(device?.status).toBe(DeviceStatus.REVOKED);
      expect(device?.revokedById).toBe(ownerId);
    });

    it('leaves the other phones at that branch working', async () => {
      // Revoking one handset must not strand the branch.
      const other = await enrol(counterBranchId, 'Simu iliyobaki');

      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: other, userId: neemaId, password })
        .expect(200);
    });
  });

  describe('the owner sees who did what, from which phone', () => {
    it('attributes a sign-in to both the person and the handset', async () => {
      const deviceId = await enrol(counterBranchId, 'Simu ya ukaguzi');

      await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId, userId: neemaId, password })
        .expect(200);

      const events = (
        await api().get('/api/v1/audit-events').set(authed(ownerToken)).expect(200)
      ).body as Array<{ action: string; deviceId: string | null; actorUserId: string | null }>;

      const signIn = events.find(
        (event) => event.action === 'DEVICE_SIGNED_IN' && event.deviceId === deviceId,
      );

      expect(signIn?.actorUserId).toBe(neemaId);
    });

    it('records the enrollment against the owner who issued the code', async () => {
      // Nobody has signed in on a freshly enrolled phone, and the device no
      // longer stands for a person — so the actor is whoever issued the code.
      const deviceId = await enrol(counterBranchId, 'Simu ya kuandikishwa');

      const events = (
        await api().get('/api/v1/audit-events').set(authed(ownerToken)).expect(200)
      ).body as Array<{ action: string; targetId: string; actorUserId: string | null }>;

      const enrolled = events.find(
        (event) => event.action === 'DEVICE_ENROLLED' && event.targetId === deviceId,
      );

      expect(enrolled?.actorUserId).toBe(ownerId);
    });
  });
});

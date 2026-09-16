import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserPermission } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Phase 9 — the two things V1 had no way to do.
 *
 * **Nobody could change a password**, so a password known to the wrong person
 * could only be changed by a developer with database access. And **nobody who
 * left could be switched off**: stripping every permission stopped them
 * selling, but they still appeared by name on the branch phone's sign-in list,
 * and a departed manager could still read the whole shop, because reading a
 * branch list or a product needs no permission at all.
 *
 * The test that matters most in this file is the one asserting a token minted
 * *before* somebody was switched off stops working on its very next request.
 * Everything else is reachable by reading the code; that one is the difference
 * between offboarding and the appearance of it.
 */
describe('Account hygiene: passwords and offboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const password = 'shoprex12345';
  const api = () => request(app.getHttpServer());
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  let ownerAToken: string;
  let ownerBToken: string;
  let branchA1Id: string;
  let branchB1Id: string;

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

  const createWorker = async (
    token: string,
    fullName: string,
    branchId: string,
    permissions: UserPermission[] = [UserPermission.SELL],
  ): Promise<string> => {
    const response = await api()
      .post('/api/v1/users/workers')
      .set(authed(token))
      .send({ fullName, password, branchId, permissions })
      .expect(201);

    return response.body.id as string;
  };

  /** Enrols a phone to a branch and signs the named person in on it. */
  const signInOnPhone = async (
    ownerToken: string,
    branchId: string,
    userId: string,
    secret = password,
  ) => {
    const issued = await api()
      .post('/api/v1/devices/enrollments')
      .set(authed(ownerToken))
      .send({ branchId, deviceName: `Simu ${Date.now()}` })
      .expect(201);

    const enrolled = await api()
      .post('/api/v1/devices/enroll')
      .send({ code: issued.body.code })
      .expect(200);

    const deviceId = enrolled.body.deviceId as string;

    const session = await api()
      .post('/api/v1/auth/device/login')
      .send({ deviceId, userId, password: secret });

    return { deviceId, status: session.status, token: session.body.accessToken as string };
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH = '100000';
    process.env.RATE_LIMIT_DEFAULT = '100000';

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

    ownerAToken = await signupOwner('Duka A', 'hygiene-a@shoprex.co.tz', '0713000001');
    ownerBToken = await signupOwner('Duka B', 'hygiene-b@shoprex.co.tz', '0713000002');

    branchA1Id = await createBranch(ownerAToken, 'Tawi A1');
    branchB1Id = await createBranch(ownerBToken, 'Tawi B1');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('§1 — changing your own password', () => {
    it('lets an owner change theirs, and the old one stops working', async () => {
      const token = await signupOwner('Duka Pass', 'pass-1@shoprex.co.tz', '0713100001');

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(token))
        .send({ currentPassword: password, newPassword: 'nenosiri-jipya-1' })
        .expect(200);

      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'pass-1@shoprex.co.tz', password })
        .expect(401);

      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'pass-1@shoprex.co.tz', password: 'nenosiri-jipya-1' })
        .expect(200);
    });

    /**
     * The whole reason `currentPassword` is required. Without it a session
     * token lifted from an unlocked browser becomes a permanent takeover in
     * one request, and until this phase there was no way back from that.
     */
    it('refuses a session that cannot prove the current password', async () => {
      const token = await signupOwner('Duka Pass2', 'pass-2@shoprex.co.tz', '0713100002');

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(token))
        .send({ currentPassword: 'si-sahihi-kabisa', newPassword: 'nenosiri-jipya-2' })
        .expect(401);

      // And the password it could not prove is still the one that works.
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'pass-2@shoprex.co.tz', password })
        .expect(200);
    });

    it('refuses a new password that is the one already in use', async () => {
      const token = await signupOwner('Duka Pass3', 'pass-3@shoprex.co.tz', '0713100003');

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(token))
        .send({ currentPassword: password, newPassword: password })
        .expect(400);
    });

    it('refuses a password too short to be worth having', async () => {
      const token = await signupOwner('Duka Pass4', 'pass-4@shoprex.co.tz', '0713100004');

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(token))
        .send({ currentPassword: password, newPassword: 'fupi' })
        .expect(400);
    });

    it('refuses an unauthenticated caller', async () => {
      await api()
        .patch('/api/v1/auth/password')
        .send({ currentPassword: password, newPassword: 'nenosiri-jipya-9' })
        .expect(401);
    });

    /** A worker on a shop phone is a person with a password like anybody else. */
    it('lets a worker change theirs from the phone', async () => {
      const workerId = await createWorker(ownerAToken, 'Neema Pass', branchA1Id);
      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId);

      expect(phone.status).toBe(200);

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(phone.token))
        .send({ currentPassword: password, newPassword: 'nenosiri-la-neema' })
        .expect(200);

      const again = await api()
        .post('/api/v1/auth/device/login')
        .send({ deviceId: phone.deviceId, userId: workerId, password });

      expect(again.status).toBe(401);
    });

    it('writes an audit line the owner can find, and never the password itself', async () => {
      const workerId = await createWorker(ownerAToken, 'Juma Audit', branchA1Id);
      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId);

      await api()
        .patch('/api/v1/auth/password')
        .set(authed(phone.token))
        .send({ currentPassword: password, newPassword: 'nenosiri-la-juma' })
        .expect(200);

      const events = await api().get('/api/v1/audit-events').set(authed(ownerAToken)).expect(200);
      const line = events.body.find(
        (event: { action: string; targetId: string }) =>
          event.action === 'PASSWORD_CHANGED' && event.targetId === workerId,
      );

      expect(line).toBeDefined();
      expect(JSON.stringify(events.body)).not.toContain('nenosiri-la-juma');
    });
  });

  describe('§2 — the owner sets somebody else’s password', () => {
    it('is the only recovery a worker has, and it works', async () => {
      const workerId = await createWorker(ownerAToken, 'Asha Reset', branchA1Id);

      await api()
        .post(`/api/v1/users/${workerId}/password`)
        .set(authed(ownerAToken))
        .send({ newPassword: 'nenosiri-jipya-asha' })
        .expect(200);

      const phone = await signInOnPhone(
        ownerAToken,
        branchA1Id,
        workerId,
        'nenosiri-jipya-asha',
      );

      expect(phone.status).toBe(200);
    });

    it('stops the old password working', async () => {
      const workerId = await createWorker(ownerAToken, 'Said Reset', branchA1Id);

      await api()
        .post(`/api/v1/users/${workerId}/password`)
        .set(authed(ownerAToken))
        .send({ newPassword: 'nenosiri-jipya-said' })
        .expect(200);

      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId, password);

      expect(phone.status).toBe(401);
    });

    it('answers 404 for another shop’s staff, never 403', async () => {
      const workerId = await createWorker(ownerBToken, 'Mtu wa B', branchB1Id);

      await api()
        .post(`/api/v1/users/${workerId}/password`)
        .set(authed(ownerAToken))
        .send({ newPassword: 'nenosiri-la-mgeni' })
        .expect(404);
    });

    /**
     * Owners are not in `STAFF_ROLES`, so this route cannot reach one — which
     * is what stops an owner setting their own password without proving the
     * old one, and stops a second owner ever being reset by the first.
     */
    it('cannot be used on an owner, including the caller themselves', async () => {
      const me = await api().get('/api/v1/auth/me').set(authed(ownerAToken)).expect(200);

      await api()
        .post(`/api/v1/users/${me.body.id}/password`)
        .set(authed(ownerAToken))
        .send({ newPassword: 'nenosiri-la-mmiliki' })
        .expect(404);
    });

    it('is refused to a manager, who is not the authority here', async () => {
      const manager = await api()
        .post('/api/v1/users/managers')
        .set(authed(ownerAToken))
        .send({
          fullName: 'Meneja Reset',
          email: 'meneja-reset@duka.co.tz',
          password,
          branchIds: [branchA1Id],
          permissions: [],
        })
        .expect(201);

      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja-reset@duka.co.tz', password })
        .expect(200);

      const workerId = await createWorker(ownerAToken, 'Mfanyakazi Reset', branchA1Id);

      await api()
        .post(`/api/v1/users/${workerId}/password`)
        .set(authed(session.body.accessToken))
        .send({ newPassword: 'nenosiri-la-meneja' })
        .expect(403);

      expect(manager.body.id).toBeDefined();
    });
  });

  describe('§3 — switching a person off', () => {
    it('stops them signing in on the shop phone', async () => {
      const workerId = await createWorker(ownerAToken, 'Ameondoka', branchA1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId);

      expect(phone.status).toBe(401);
    });

    /**
     * **The test this file exists for.** Everything else was already true by
     * accident; this is the one that was not. A token minted before somebody
     * was switched off used to keep working until it expired — up to eight
     * hours of a departed manager reading the shop — because the JWT guard
     * never touches the database and reading a branch or a product needs no
     * permission to check.
     */
    it('kills a session they were already holding, on its very next request', async () => {
      const workerId = await createWorker(ownerAToken, 'Tokeni Hai', branchA1Id, [
        UserPermission.SELL,
      ]);
      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId);

      expect(phone.status).toBe(200);

      // The token works right now, on a route that needs no permission at all.
      await api().get('/api/v1/branches').set(authed(phone.token)).expect(200);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      // Same token, next request. 403 rather than 401 everywhere, including
      // `/auth/me`: the guard refuses before any handler runs, and the
      // credential itself is perfectly good — sending them back to sign in
      // would loop them into the same refusal.
      await api().get('/api/v1/branches').set(authed(phone.token)).expect(403);
      await api().get('/api/v1/auth/me').set(authed(phone.token)).expect(403);
    });

    it('takes their name off the phone’s sign-in list', async () => {
      const stays = await createWorker(ownerAToken, 'Anabaki', branchA1Id);
      const goes = await createWorker(ownerAToken, 'Anaondoka', branchA1Id);

      const issued = await api()
        .post('/api/v1/devices/enrollments')
        .set(authed(ownerAToken))
        .send({ branchId: branchA1Id, deviceName: 'Simu ya orodha' })
        .expect(201);

      const enrolled = await api()
        .post('/api/v1/devices/enroll')
        .send({ code: issued.body.code })
        .expect(200);

      await api()
        .patch(`/api/v1/users/${goes}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      const people = await api()
        .get(`/api/v1/auth/device/${enrolled.body.deviceId}/people`)
        .expect(200);

      const ids = people.body.map((person: { userId: string }) => person.userId);

      expect(ids).toContain(stays);
      expect(ids).not.toContain(goes);
    });

    it('switches them back on again, history and all', async () => {
      const workerId = await createWorker(ownerAToken, 'Amerudi', branchA1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      const back = await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: true })
        .expect(200);

      expect(back.body.isActive).toBe(true);
      expect(back.body.fullName).toBe('Amerudi');

      const phone = await signInOnPhone(ownerAToken, branchA1Id, workerId);
      expect(phone.status).toBe(200);
    });

    it('does not delete them — they are still listed, marked off', async () => {
      const workerId = await createWorker(ownerAToken, 'Bado Yupo', branchA1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      const staff = await api().get('/api/v1/users').set(authed(ownerAToken)).expect(200);
      const row = staff.body.find((person: { id: string }) => person.id === workerId);

      expect(row).toBeDefined();
      expect(row.isActive).toBe(false);
    });

    it('answers 404 for another shop’s staff, never 403', async () => {
      const workerId = await createWorker(ownerBToken, 'Mtu mwingine wa B', branchB1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(404);
    });

    it('cannot be used on an owner, so nobody locks themselves out', async () => {
      const me = await api().get('/api/v1/auth/me').set(authed(ownerAToken)).expect(200);

      await api()
        .patch(`/api/v1/users/${me.body.id}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(404);
    });

    it('is refused to a manager', async () => {
      await api()
        .post('/api/v1/users/managers')
        .set(authed(ownerAToken))
        .send({
          fullName: 'Meneja Status',
          email: 'meneja-status@duka.co.tz',
          password,
          branchIds: [branchA1Id],
          permissions: [],
        })
        .expect(201);

      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja-status@duka.co.tz', password })
        .expect(200);

      const workerId = await createWorker(ownerAToken, 'Asiyeguswa', branchA1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(session.body.accessToken))
        .send({ isActive: false })
        .expect(403);
    });

    it('records who switched them off, for the owner to read back', async () => {
      const workerId = await createWorker(ownerAToken, 'Kwenye Kumbukumbu', branchA1Id);

      await api()
        .patch(`/api/v1/users/${workerId}/status`)
        .set(authed(ownerAToken))
        .send({ isActive: false })
        .expect(200);

      const events = await api().get('/api/v1/audit-events').set(authed(ownerAToken)).expect(200);
      const line = events.body.find(
        (event: { action: string; targetId: string }) =>
          event.action === 'STAFF_DEACTIVATED' && event.targetId === workerId,
      );

      expect(line).toBeDefined();
    });
  });

  describe('§4 — the log an owner actually reads', () => {
    /**
     * A busy shop produces completed sales by the hundred. They are the shop
     * working, not noise — but a log they dominate is a log nobody scans, and
     * the reason somebody opens it is the one line that is not a sale.
     */
    it('leaves the everyday events out of the notable view', async () => {
      const all = await api()
        .get('/api/v1/audit-events')
        .query({ limit: 200, scope: 'all' })
        .set(authed(ownerAToken))
        .expect(200);

      const notable = await api()
        .get('/api/v1/audit-events')
        .query({ limit: 200, scope: 'notable' })
        .set(authed(ownerAToken))
        .expect(200);

      const routine = ['SALE_COMPLETED', 'STOCK_RECEIVED', 'DEVICE_SIGNED_IN'];

      expect(all.body.length).toBeGreaterThan(0);
      expect(notable.body.every((e: { action: string }) => !routine.includes(e.action))).toBe(true);
      expect(notable.body.length).toBeLessThanOrEqual(all.body.length);
    });

    /**
     * `notable` subtracts rather than whitelists, so an action added in a
     * later phase appears here without anybody remembering to list it. This
     * test is what would notice if that ever flipped.
     */
    it('keeps the events worth noticing, including this phase’s new ones', async () => {
      const notable = await api()
        .get('/api/v1/audit-events')
        .query({ limit: 200, scope: 'notable' })
        .set(authed(ownerAToken))
        .expect(200);

      const actions = notable.body.map((e: { action: string }) => e.action);

      expect(actions).toContain('STAFF_DEACTIVATED');
      expect(actions).toContain('PASSWORD_CHANGED');
      expect(actions).toContain('WORKER_CREATED');
    });

    it('defaults to everything, because an API that silently omits records is worse', async () => {
      const bare = await api()
        .get('/api/v1/audit-events')
        .query({ limit: 200 })
        .set(authed(ownerAToken))
        .expect(200);

      expect(bare.body.some((e: { action: string }) => e.action === 'SALE_COMPLETED')).toBe(false);
      // No sales are rung up in this file, so prove the default the other way:
      // it matches `all` exactly.
      const all = await api()
        .get('/api/v1/audit-events')
        .query({ limit: 200, scope: 'all' })
        .set(authed(ownerAToken))
        .expect(200);

      expect(bare.body.length).toBe(all.body.length);
    });

    it('refuses a scope that is not one of the two', async () => {
      await api()
        .get('/api/v1/audit-events')
        .query({ scope: 'kila-kitu' })
        .set(authed(ownerAToken))
        .expect(400);
    });

    it('is owner-only — a manager cannot read the shop’s log', async () => {
      await api()
        .post('/api/v1/users/managers')
        .set(authed(ownerAToken))
        .send({
          fullName: 'Meneja Log',
          email: 'meneja-log@duka.co.tz',
          password,
          branchIds: [branchA1Id],
          permissions: [],
        })
        .expect(201);

      const session = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'meneja-log@duka.co.tz', password })
        .expect(200);

      await api()
        .get('/api/v1/audit-events')
        .set(authed(session.body.accessToken))
        .expect(403);
    });
  });
});

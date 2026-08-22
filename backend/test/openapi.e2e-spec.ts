import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/database/prisma.service';
import { API_DOCS_PATH, BEARER_AUTH, setupSwagger } from '../src/docs/swagger';

/**
 * Phase 1's acceptance check requires the API contract to be *browsable*, not
 * merely describable. These tests boot the real HTTP surface and read the
 * published document, so a route added later without documentation, or a
 * protected route that forgets its bearer requirement, fails here.
 *
 * PostgreSQL is stubbed: the contract does not depend on stored data.
 */
type HttpMethod = 'get' | 'post' | 'patch';

describe('OpenAPI contract (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://shoprex:shoprex_local_password@localhost:5432/shoprex?schema=public';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ ping: jest.fn(), $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    document = setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the contract is browsable', () => {
    it('serves the Swagger UI at /docs', async () => {
      const response = await request(app.getHttpServer())
        .get(`/${API_DOCS_PATH}`)
        .expect(200);

      expect(response.text).toContain('Shoprex V1 API');
    });

    it('serves the raw document at /docs-json', async () => {
      const response = await request(app.getHttpServer())
        .get(`/${API_DOCS_PATH}-json`)
        .expect(200);

      expect(response.body.openapi).toMatch(/^3\./);
      expect(response.body.info.title).toBe('Shoprex V1 API');
    });

    it('keeps /docs outside the API prefix, so it survives an API_PREFIX change', async () => {
      await request(app.getHttpServer()).get(`/api/v1/${API_DOCS_PATH}`).expect(404);
    });
  });

  describe('every documented route is real, and every real route is documented', () => {
    const expected: [string, HttpMethod][] = [
      ['/api/v1/health', 'get'],
      ['/api/v1/health/live', 'get'],
      ['/api/v1/health/ready', 'get'],
      ['/api/v1/auth/signup', 'post'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/device/login', 'post'],
      ['/api/v1/auth/me', 'get'],
      ['/api/v1/auth/dev-credentials', 'get'],
      ['/api/v1/businesses', 'post'],
      ['/api/v1/businesses', 'get'],
      ['/api/v1/businesses/me', 'get'],
      ['/api/v1/branches', 'post'],
      ['/api/v1/branches', 'get'],
      ['/api/v1/branches/{id}', 'get'],
      // Phase 2 — people and devices.
      ['/api/v1/users/managers', 'post'],
      ['/api/v1/users/workers', 'post'],
      ['/api/v1/users', 'get'],
      ['/api/v1/users/{id}', 'get'],
      ['/api/v1/users/{id}/permissions', 'patch'],
      ['/api/v1/devices/enrollments', 'post'],
      ['/api/v1/devices/enroll', 'post'],
      ['/api/v1/devices', 'get'],
      ['/api/v1/devices/{id}', 'get'],
      ['/api/v1/devices/{id}/revoke', 'post'],
      ['/api/v1/audit-events', 'get'],
    ];

    it.each(expected)('documents %s %s', (path, method) => {
      const operation = document.paths[path]?.[method];

      expect(operation).toBeDefined();
      expect(operation?.summary).toBeTruthy();
    });

    it('documents no route that the application does not serve', () => {
      const documented = Object.keys(document.paths).sort();
      const known = [...new Set(expected.map(([path]) => path))].sort();

      expect(documented).toEqual(known);
    });
  });

  describe('authorization is visible in the contract', () => {
    it('declares the JWT bearer scheme', () => {
      expect(document.components?.securitySchemes?.[BEARER_AUTH]).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it.each([
      ['/api/v1/auth/me', 'get'],
      ['/api/v1/businesses', 'post'],
      ['/api/v1/businesses', 'get'],
      ['/api/v1/businesses/me', 'get'],
      ['/api/v1/branches', 'post'],
      ['/api/v1/branches', 'get'],
      ['/api/v1/branches/{id}', 'get'],
      ['/api/v1/users/managers', 'post'],
      ['/api/v1/users/workers', 'post'],
      ['/api/v1/users', 'get'],
      ['/api/v1/users/{id}', 'get'],
      ['/api/v1/users/{id}/permissions', 'patch'],
      ['/api/v1/devices/enrollments', 'post'],
      ['/api/v1/devices', 'get'],
      ['/api/v1/devices/{id}', 'get'],
      ['/api/v1/devices/{id}/revoke', 'post'],
      ['/api/v1/audit-events', 'get'],
    ] as [string, HttpMethod][])(
      'marks %s %s as requiring a bearer token',
      (path, method) => {
        const operation = document.paths[path]?.[method];

        expect(operation?.security).toContainEqual({ [BEARER_AUTH]: [] });
      },
    );

    it.each([
      ['/api/v1/health', 'get'],
      ['/api/v1/auth/signup', 'post'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/dev-credentials', 'get'],
      // A phone signing in, and a phone redeeming an enrollment code, both
      // arrive without a token. Both sit in the strict auth rate-limit bucket
      // instead — see the rate-limit suite.
      ['/api/v1/auth/device/login', 'post'],
      ['/api/v1/devices/enroll', 'post'],
    ] as [string, HttpMethod][])(
      'leaves the public route %s %s unauthenticated',
      (path, method) => {
        const operation = document.paths[path]?.[method];

        expect(operation?.security ?? []).toHaveLength(0);
      },
    );
  });

  describe('the tenancy rules are readable from the contract', () => {
    /**
     * Every request body the document actually declares, walked rather than
     * listed, so a new endpoint is examined without anyone remembering to
     * extend this test.
     */
    const requestBodySchemas = (): string[] =>
      Object.values(document.paths)
        .flatMap((item) => Object.values(item))
        .flatMap((operation) => {
          const ref = (
            operation as {
              requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
            }
          ).requestBody?.content?.['application/json']?.schema?.$ref;

          return ref ? [ref.replace('#/components/schemas/', '')] : [];
        });

    const propertiesOf = (name: string): string[] => {
      const schema = document.components?.schemas?.[name];

      return Object.keys(('properties' in schema! && schema.properties) || {});
    };

    it('never accepts a tenant id in any request body', () => {
      const offenders = requestBodySchemas().filter((name) =>
        propertiesOf(name).some((key) => /^businessId$/i.test(key)),
      );

      // Guards the walk itself: an empty list would pass vacuously.
      expect(requestBodySchemas()).toEqual(
        expect.arrayContaining(['SignupDto', 'LoginDto', 'CreateBranchDto', 'CreateBusinessDto']),
      );
      expect(offenders).toEqual([]);
    });

    /**
     * Branch ids are a narrower rule than tenant ids, and deliberately so.
     *
     * The tenant is never negotiable: it comes from the token, and no body may
     * carry it. A branch is different — a business has several, and only the
     * owner knows which one a new worker actually stands in, so somebody has
     * to name it. Phase 1 banned both outright because nothing then had a
     * legitimate reason to name a branch; Phase 2's worker and manager
     * creation does.
     *
     * So the ban is now an allowlist. A DTO may name a branch only if it
     * appears below, and every entry here is backed by a test proving that a
     * branch belonging to another tenant answers 404 rather than becoming an
     * assignment — see users.e2e-spec.ts. Adding a DTO to this list without
     * that test is the mistake this pinning exists to make visible.
     */
    const MAY_NAME_A_BRANCH = ['CreateWorkerDto', 'CreateManagerDto'];

    it('accepts a branch id only where the owner must choose one', () => {
      const naming = requestBodySchemas().filter((name) =>
        propertiesOf(name).some((key) => /^branchIds?$/i.test(key)),
      );

      expect([...new Set(naming)].sort()).toEqual([...MAY_NAME_A_BRANCH].sort());
    });

    it('describes, on each of those, that a foreign branch answers 404', () => {
      const documented = Object.values(document.paths)
        .flatMap((item) => Object.entries(item))
        .filter(([, operation]) => {
          const ref = (
            operation as {
              requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
            }
          ).requestBody?.content?.['application/json']?.schema?.$ref;

          return Boolean(
            ref && MAY_NAME_A_BRANCH.includes(ref.replace('#/components/schemas/', '')),
          );
        });

      expect(documented).toHaveLength(MAY_NAME_A_BRANCH.length);

      for (const [, operation] of documented) {
        expect((operation as { responses: Record<string, unknown> }).responses['404']).toBeDefined();
      }
    });

    it('never returns an enrollment code from anything but the single issue moment', () => {
      // The code is a secret. Accepting one in a request body is the whole
      // point of redemption, so only *responses* are examined here. It appears
      // in exactly one of them, at issue, and must never leak into a device
      // view, a staff view, a profile, or an audit entry.
      const responseSchemas = new Set(
        Object.values(document.paths)
          .flatMap((item) => Object.values(item))
          .flatMap((operation) =>
            Object.values(
              (operation as { responses?: Record<string, unknown> }).responses ?? {},
            ),
          )
          .flatMap((response) => {
            const schema = (
              response as {
                content?: Record<string, { schema?: { $ref?: string; items?: { $ref?: string } } }>;
              }
            ).content?.['application/json']?.schema;

            const ref = schema?.$ref ?? schema?.items?.$ref;

            return ref ? [ref.replace('#/components/schemas/', '')] : [];
          }),
      );

      // Guards the walk: an empty set would pass vacuously.
      expect(responseSchemas.has('IssuedEnrollmentViewDto')).toBe(true);
      expect(responseSchemas.has('DeviceViewDto')).toBe(true);

      const leaking = [...responseSchemas]
        .filter((name) =>
          Object.keys(
            ('properties' in document.components!.schemas![name] &&
              document.components!.schemas![name].properties) ||
              {},
          ).some((key) => /^(code|token|tokenHash|password|passwordHash)$/i.test(key)),
        )
        .sort();

      expect(leaking).toEqual([
        // The one deliberate exception, from Phase 1: the seeded development
        // logins the web form prefills itself from. It is empty unless
        // NODE_ENV is not production *and* DEV_LOGIN_AUTOFILL=true, so a
        // deployed Shoprex never hands these out — see AuthService.devCredentials.
        'DevCredentialDto',
        // Issued once, then never again.
        'IssuedEnrollmentViewDto',
      ]);
    });

    it('publishes the shared error envelope so both clients parse one shape', () => {
      const schema = document.components?.schemas?.ErrorResponseDto;

      expect(schema).toBeDefined();
      expect(Object.keys(('properties' in schema! && schema.properties) || {})).toEqual(
        expect.arrayContaining(['statusCode', 'error', 'message', 'path', 'timestamp']),
      );
    });

    it('documents that a cross-tenant branch read answers 404, not 403', () => {
      const operation = document.paths['/api/v1/branches/{id}']?.get;

      expect(operation?.responses['404']).toBeDefined();
      expect(operation?.responses['403']).toBeUndefined();
      expect(JSON.stringify(operation?.description)).toContain('404');
    });
  });
});

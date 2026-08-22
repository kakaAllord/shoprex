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

  describe('every Phase 1 route is documented', () => {
    const expected: [string, string][] = [
      ['/api/v1/health', 'get'],
      ['/api/v1/health/live', 'get'],
      ['/api/v1/health/ready', 'get'],
      ['/api/v1/auth/signup', 'post'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/me', 'get'],
      ['/api/v1/auth/dev-credentials', 'get'],
      ['/api/v1/businesses', 'post'],
      ['/api/v1/businesses', 'get'],
      ['/api/v1/businesses/me', 'get'],
      ['/api/v1/branches', 'post'],
      ['/api/v1/branches', 'get'],
      ['/api/v1/branches/{id}', 'get'],
    ];

    it.each(expected)('documents %s %s', (path, method) => {
      const operation = document.paths[path]?.[method as 'get' | 'post'];

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
    ])('marks %s %s as requiring a bearer token', (path, method) => {
      const operation = document.paths[path]?.[method as 'get' | 'post'];

      expect(operation?.security).toContainEqual({ [BEARER_AUTH]: [] });
    });

    it.each([
      ['/api/v1/health', 'get'],
      ['/api/v1/auth/signup', 'post'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/dev-credentials', 'get'],
    ])('leaves the public route %s %s unauthenticated', (path, method) => {
      const operation = document.paths[path]?.[method as 'get' | 'post'];

      expect(operation?.security ?? []).toHaveLength(0);
    });
  });

  describe('the tenancy rules are readable from the contract', () => {
    it('never accepts a tenant or branch id in any request body', () => {
      // Walks every request body the document actually declares, rather than a
      // hardcoded list, so a Phase 2 endpoint that starts accepting a tenant id
      // fails here without anyone remembering to extend this test.
      const bodySchemaNames = Object.values(document.paths)
        .flatMap((item) => Object.values(item))
        .flatMap((operation) => {
          const ref = (
            operation as {
              requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
            }
          ).requestBody?.content?.['application/json']?.schema?.$ref;

          return ref ? [ref.replace('#/components/schemas/', '')] : [];
        });

      const offenders = bodySchemaNames.filter((name) => {
        const schema = document.components?.schemas?.[name];
        const properties = ('properties' in schema! && schema.properties) || {};

        return Object.keys(properties).some((key) => /^(businessId|branchId)$/i.test(key));
      });

      // Guards the walk itself: an empty list would pass vacuously.
      expect(bodySchemaNames).toEqual(
        expect.arrayContaining(['SignupDto', 'LoginDto', 'CreateBranchDto', 'CreateBusinessDto']),
      );
      expect(offenders).toEqual([]);
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

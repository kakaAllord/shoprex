import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

/** The bearer scheme's name, referenced by @ApiBearerAuth() on controllers. */
export const BEARER_AUTH = 'bearer';

export const API_DOCS_PATH = 'docs';

const DESCRIPTION = `The single authoritative Shoprex backend. The Next.js web app and the
React Native Android app are both clients of this API — neither opens a database
connection of its own.

**Tenancy.** A *business* is the tenant. The tenant is always derived from the
verified bearer token: no endpoint accepts a business id in a request body or
query string. A read that crosses a tenant boundary answers **404, never 403**,
so a caller cannot learn that someone else's record exists.

**Timestamps.** Every stored timestamp is set by the backend server clock. The
API does not accept a client-supplied time for anything a report depends on.

**Errors.** Every failure uses one envelope — see the \`ErrorResponseDto\` schema.

**Devices.** One device belongs to exactly one worker, and Shoprex mints its
\`device_id\` server-side at enrollment — Android exposes no reliable permanent
hardware identifier, so a client never supplies one. Enrollment codes are
single-use and short-lived, returned once at issue and never echoed back. A
revoked device is refused by the backend on its very next request.

**Rate limits.** Two buckets, both per client address: a default bucket over the
API at large, and a strict bucket on \`POST /auth/login\`, \`POST /auth/signup\`,
\`POST /auth/device/login\`, and \`POST /devices/enroll\`. Exceeding either
answers \`429\`.

**Stock.** Every product carries its own package relationships: a Carton is
6 Pieces for one product and 48 for another. Stock is reported two ways — the
physical package state a shopkeeper would recite (\`5 Cartons + 5 Pieces\`) and
a normalized quantity for arithmetic. Selling a Piece breaks a Carton open; the
engine never repackages upward, because six loose Pieces are not a Carton.
Prices are whole Tanzanian shillings, one price per unit across the business.

**Barcodes.** EAN-13. A 12-digit UPC-A is accepted and widened to its EAN-13
form, and the check digit is verified — a mis-scan answers \`400\` rather than
being stored as a product nothing will ever match again.

V1 is online-only: there is no offline queue, outbox, or sync endpoint.`;

/** Builds the OpenAPI document. Exported so tests can assert on the contract. */
export function buildOpenApiDocument(
  app: INestApplication,
  version = '0.1.0',
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Shoprex V1 API')
    .setDescription(DESCRIPTION)
    .setVersion(version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The `accessToken` returned by /auth/login or /auth/signup.',
      },
      BEARER_AUTH,
    )
    .addTag('health', 'Public liveness and readiness. No token required.')
    .addTag('auth', 'Owner self-registration, sign-in, and the signed-in profile.')
    .addTag('businesses', 'The tenant. Platform-admin onboarding and own-business reads.')
    .addTag('branches', 'Branches within the caller’s own business.')
    .addTag('users', 'Delegated managers and workers, and what each may do.')
    .addTag(
      'devices',
      'One Android installation per worker: enrollment, listing, and revocation.',
    )
    .addTag('audit', 'Who did what, from which device, and when.')
    .addTag(
      'products',
      'The catalogue: products, their packagings, prices, and barcodes.',
    )
    .addTag('stock', 'What each branch physically holds, and deliveries into it.')
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
}

/**
 * Serves the browsable contract at /docs, with the raw document at /docs-json.
 * Deliberately mounted outside the API prefix so it is a stable address that
 * does not move when API_PREFIX changes.
 */
export function setupSwagger(app: INestApplication, version = '0.1.0'): OpenAPIObject {
  const document = buildOpenApiDocument(app, version);

  SwaggerModule.setup(API_DOCS_PATH, app, document, {
    jsonDocumentUrl: `${API_DOCS_PATH}-json`,
    yamlDocumentUrl: `${API_DOCS_PATH}-yaml`,
    swaggerOptions: {
      // The token survives a page reload, so exploring protected routes does
      // not mean pasting a JWT after every change.
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Shoprex V1 API',
  });

  return document;
}

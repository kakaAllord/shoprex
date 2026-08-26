/**
 * Runs before every e2e test module is loaded.
 *
 * Points the API at a dedicated PostgreSQL schema so integration tests never
 * touch development data, and fixes the settings the API validates at boot.
 */
// Load backend/.env first: every address and secret lives there, not in code.
require('dotenv').config({ path: `${__dirname}/../.env` });

const { resolveTestDatabaseUrl } = require('./e2e-database');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'shoprex_e2e_secret_value_1234567890';
process.env.JWT_EXPIRES_IN = '15m';
// Deliberately off: the dev-credentials endpoint must stay closed by default.
delete process.env.DEV_LOGIN_AUTOFILL;

// Generous limits so functional suites are never throttled.
//
// These are assigned unconditionally, and that is the fix rather than the
// oversight. They used to read `process.env.X ?? '10000'`, which looks like a
// courtesy to a developer overriding from the shell but never was: dotenv has
// already loaded backend/.env two lines above, so `RATE_LIMIT_DEFAULT=120`
// from a real developer's file always won and every suite ran at the
// production limit. A long suite then failed with 429 depending on how many
// requests it happened to make and how fast the machine was — which is the
// worst kind of test failure, because it points at the wrong code.
//
// `rate-limit.e2e-spec.ts` is unaffected: it sets its own limits inside
// `beforeAll`, which runs after this file, and imports AppModule afterwards
// so the throttler reads them.
process.env.RATE_LIMIT_DEFAULT = '10000';
process.env.RATE_LIMIT_AUTH = '10000';
process.env.RATE_LIMIT_TTL_MS = '60000';

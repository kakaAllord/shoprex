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
// Generous limits so functional suites are not throttled; the throttling
// suite lowers them itself before the app is built.
process.env.RATE_LIMIT_DEFAULT = process.env.RATE_LIMIT_DEFAULT ?? '10000';
process.env.RATE_LIMIT_AUTH = process.env.RATE_LIMIT_AUTH ?? '10000';
process.env.RATE_LIMIT_TTL_MS = process.env.RATE_LIMIT_TTL_MS ?? '60000';

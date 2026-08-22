const TEST_SCHEMA = 'shoprex_e2e';

/**
 * Reuses the configured PostgreSQL server but isolates the tests in their own
 * schema, so a test run can never delete development rows.
 */
function resolveTestDatabaseUrl() {
  // The connection string is configuration: it comes from backend/.env
  // (or TEST_DATABASE_URL to point tests at a different server entirely).
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Copy backend/.env.example to backend/.env before running the e2e suite.',
    );
  }

  const url = new URL(base);
  url.searchParams.set('schema', TEST_SCHEMA);

  return url.toString();
}

module.exports = { resolveTestDatabaseUrl, TEST_SCHEMA };

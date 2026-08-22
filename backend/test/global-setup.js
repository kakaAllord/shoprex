const { execSync } = require('node:child_process');
require('dotenv').config({ path: `${__dirname}/../.env` });
const { resolveTestDatabaseUrl } = require('./e2e-database');

/** Applies migrations to the isolated e2e schema once per test run. */
module.exports = async () => {
  const databaseUrl = resolveTestDatabaseUrl();

  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/..`,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });
};

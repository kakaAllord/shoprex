/** End-to-end test configuration for the Shoprex backend (*.e2e-spec.ts). */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: '\\.e2e-spec\\.ts$',
  // Only TypeScript goes through ts-jest; the .js setup helpers run as-is.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globalSetup: '<rootDir>/test/global-setup.js',
  setupFiles: ['<rootDir>/test/e2e-env.js'],
  testTimeout: 30000,
};

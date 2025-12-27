module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services'],
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  collectCoverageFrom: [
    'services/*/src/**/*.ts',
    '!services/*/src/**/*.d.ts',
    '!services/*/src/__tests__/**',
    '!services/*/src/index.ts',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/services/api-gateway/src/__tests__/integration/setup.ts'],
  testTimeout: 120000, // 2 minutes for integration tests
  maxWorkers: 1, // Run integration tests sequentially
  forceExit: true,
  detectOpenHandles: true,
  verbose: true,
  testSequencer: '<rootDir>/jest.integration.sequencer.js',
  globalSetup: '<rootDir>/jest.integration.global-setup.js',
  globalTeardown: '<rootDir>/jest.integration.global-teardown.js'
};
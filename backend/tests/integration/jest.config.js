module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/e2e/**/*.test.ts',
    '**/performance/**/*.test.ts',
    '**/security/**/*.test.ts',
    '**/system/**/*.test.ts'
  ],
  collectCoverageFrom: [
    '../services/*/src/**/*.ts',
    '../shared/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/dist/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/setup/jest.setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  forceExit: true,
  detectOpenHandles: true,
  verbose: true,
  globalSetup: '<rootDir>/setup/global-setup.ts',
  globalTeardown: '<rootDir>/setup/global-teardown.ts',
  testSequencer: '<rootDir>/setup/test-sequencer.js'
};
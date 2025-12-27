module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/functional/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage/functional',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/functional/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1, // Run functional tests sequentially to avoid conflicts
  forceExit: true,
  detectOpenHandles: true,
  verbose: true,
  testSequencer: '<rootDir>/jest.sequencer.js'
};
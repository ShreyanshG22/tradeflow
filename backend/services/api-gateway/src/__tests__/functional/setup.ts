// Functional test setup for API Gateway
import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-functional-tests';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-functional-tests';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://test_user:test_password@localhost:5432/tradeflow_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Test database configuration
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tradeflow_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Redis test configuration
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '1';

// API Gateway configuration
process.env.USER_SERVICE_URL = 'http://localhost:3002';
process.env.STRATEGY_SERVICE_URL = 'http://localhost:3003';
process.env.PORTFOLIO_SERVICE_URL = 'http://localhost:3004';
process.env.MARKET_DATA_SERVICE_URL = 'http://localhost:3005';

// CORS configuration for tests
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Rate limiting configuration (more lenient for tests)
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX = '1000';

// Global test timeout for functional tests (longer than unit tests)
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error, // Keep error for debugging
};

// Global test setup
beforeAll(async () => {
  // Any global setup needed for functional tests
});

// Global test cleanup
afterAll(async () => {
  // Any global cleanup needed for functional tests
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

export {};
// Test setup for market-data-service
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.ALPHA_VANTAGE_API_KEY = 'test-api-key';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '3002';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
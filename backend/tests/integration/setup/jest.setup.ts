import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.TEST_PORT = process.env.TEST_PORT || '3001';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting Zerodha Integration Test Suite');
  console.log(`📊 Test Environment: ${process.env.NODE_ENV}`);
  console.log(`🔌 Test Port: ${process.env.TEST_PORT}`);
  console.log(`💾 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}`);
  console.log(`🔴 Redis: ${process.env.REDIS_URL?.split('@')[1] || 'Not configured'}`);
});

afterAll(async () => {
  console.log('✅ Zerodha Integration Test Suite Completed');
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Suppress console.log in tests unless explicitly needed
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  if (process.env.VERBOSE_TESTS === 'true') {
    originalConsoleLog(...args);
  }
};

// Mock external services for testing
jest.mock('../../../shared/zerodha-utils/src/api-client', () => ({
  ZerodhaApiClient: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn().mockResolvedValue({ access_token: 'mock_token' }),
    getProfile: jest.fn().mockResolvedValue({ user_id: 'mock_user' }),
    placeOrder: jest.fn().mockResolvedValue({ order_id: 'mock_order_id' }),
    getQuotes: jest.fn().mockResolvedValue({ 'NSE:RELIANCE': { last_price: 2500 } }),
    getHistoricalData: jest.fn().mockResolvedValue({ candles: [] })
  }))
}));

// Global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateRandomString: (length: number = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  generateRandomNumber: (min: number = 1, max: number = 1000) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  
  expectValidTimestamp: (timestamp: string) => {
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(timestamp).getTime()).toBeGreaterThan(0);
  },
  
  expectValidUUID: (uuid: string) => {
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }
};

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidPrice(): R;
      toBeValidOrderId(): R;
      toBeValidInstrumentToken(): R;
    }
  }
  
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    generateRandomString: (length?: number) => string;
    generateRandomNumber: (min?: number, max?: number) => number;
    expectValidTimestamp: (timestamp: string) => void;
    expectValidUUID: (uuid: string) => void;
  };
}

expect.extend({
  toBeValidPrice(received: number) {
    const pass = typeof received === 'number' && received > 0 && received < 1000000;
    return {
      message: () => `expected ${received} to be a valid price (positive number < 1,000,000)`,
      pass
    };
  },
  
  toBeValidOrderId(received: string) {
    const pass = typeof received === 'string' && received.length > 0 && /^[A-Z0-9]+$/.test(received);
    return {
      message: () => `expected ${received} to be a valid order ID (alphanumeric string)`,
      pass
    };
  },
  
  toBeValidInstrumentToken(received: number) {
    const pass = typeof received === 'number' && received > 0 && received < 99999999;
    return {
      message: () => `expected ${received} to be a valid instrument token (positive integer < 99,999,999)`,
      pass
    };
  }
});
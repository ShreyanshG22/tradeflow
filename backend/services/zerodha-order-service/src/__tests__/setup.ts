// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.ZERODHA_API_KEY = 'test_api_key';
process.env.ZERODHA_API_SECRET = 'test_api_secret';
process.env.JWT_SECRET = 'test_jwt_secret';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Date for consistent testing
const mockDate = new Date('2024-01-15T10:30:00.000Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

// Global test utilities
global.createMockOrder = (overrides = {}) => ({
  order_id: 'ORDER123',
  account_id: 'user123',
  placed_by: 'user123',
  exchange: 'NSE',
  tradingsymbol: 'RELIANCE',
  transaction_type: 'BUY',
  quantity: 10,
  product: 'CNC',
  order_type: 'LIMIT',
  price: 2500,
  trigger_price: 0,
  validity: 'DAY',
  disclosed_quantity: 0,
  status: 'OPEN',
  order_timestamp: '2024-01-15T10:30:00.000Z',
  filled_quantity: 0,
  pending_quantity: 10,
  cancelled_quantity: 0,
  average_price: 0,
  tag: null,
  guid: 'test-guid-123',
  ...overrides
});

global.createMockOrderRequest = (overrides = {}) => ({
  exchange: 'NSE' as const,
  tradingsymbol: 'RELIANCE',
  transaction_type: 'BUY' as const,
  quantity: 10,
  product: 'CNC' as const,
  order_type: 'LIMIT' as const,
  price: 2500,
  validity: 'DAY' as const,
  ...overrides
});

global.createMockInstrument = (overrides = {}) => ({
  instrument_token: 738561,
  exchange_token: 2885,
  tradingsymbol: 'RELIANCE',
  name: 'Reliance Industries Limited',
  last_price: 2500,
  tick_size: 0.05,
  lot_size: 1,
  instrument_type: 'EQ',
  segment: 'EQ',
  exchange: 'NSE' as const,
  ...overrides
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for unhandled promises in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidOrder(): R;
      toHaveOrderError(error: string): R;
    }
  }

  var createMockOrder: (overrides?: any) => any;
  var createMockOrderRequest: (overrides?: any) => any;
  var createMockInstrument: (overrides?: any) => any;
}

// Custom Jest matchers
expect.extend({
  toBeValidOrder(received) {
    const pass = received && 
                 received.order_id && 
                 received.tradingsymbol && 
                 received.exchange &&
                 received.status;
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid order`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid order`,
        pass: false,
      };
    }
  },

  toHaveOrderError(received, error) {
    const pass = received && 
                 received.errors && 
                 Array.isArray(received.errors) &&
                 received.errors.some((err: string) => err.includes(error));
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to have error "${error}"`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to have error "${error}"`,
        pass: false,
      };
    }
  },
});
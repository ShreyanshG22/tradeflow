import { Pool } from 'pg';

// Mock database pool
export const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
} as unknown as Pool;

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
export const createMockUser = (overrides = {}) => ({
  user_id: 'test-user-123',
  email: 'test@example.com',
  ...overrides
});

export const createMockRiskLimits = (overrides = {}) => ({
  max_order_value: 100000,
  max_position_size: 500000,
  max_orders_per_minute: 10,
  max_daily_loss: 50000,
  max_portfolio_exposure: 1000000,
  max_sector_exposure: 300000,
  allowed_products: ['CNC', 'MIS', 'NRML'],
  allowed_exchanges: ['NSE', 'BSE'],
  blocked_instruments: [],
  margin_multiplier: 1.2,
  min_margin_balance: 10000,
  trading_hours_start: '09:15',
  trading_hours_end: '15:30',
  auto_square_off_enabled: true,
  square_off_time: '15:20',
  loss_alert_threshold: 0.8,
  exposure_alert_threshold: 0.9,
  ...overrides
});

export const createMockOrderRequest = (overrides = {}) => ({
  user_id: 'test-user-123',
  exchange: 'NSE',
  tradingsymbol: 'RELIANCE',
  transaction_type: 'BUY' as const,
  quantity: 100,
  product: 'CNC',
  order_type: 'LIMIT',
  price: 2500,
  ...overrides
});
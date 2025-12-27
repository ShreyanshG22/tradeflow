import { DatabaseService } from '../../../user-service/src/services/database';
import { RedisService } from '../../../user-service/src/services/redis';

// Global test setup for integration tests
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Initialize database with test configuration
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5433/tradeflow_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380/1';
  
  // Initialize services
  await DatabaseService.initialize();
  await RedisService.initialize();
  
  // Clean up any existing test data
  await cleanupTestData();
});

afterAll(async () => {
  // Final cleanup
  await cleanupTestData();
  
  // Close connections
  await DatabaseService.close();
  await RedisService.close();
});

// Helper function to clean up test data
async function cleanupTestData() {
  try {
    // Clean up in reverse dependency order
    await DatabaseService.query('DELETE FROM trades WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))', ['%test%']);
    await DatabaseService.query('DELETE FROM positions WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))', ['%test%']);
    await DatabaseService.query('DELETE FROM portfolios WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%test%']);
    await DatabaseService.query('DELETE FROM backtest_results WHERE backtest_id IN (SELECT id FROM backtests WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))', ['%test%']);
    await DatabaseService.query('DELETE FROM backtests WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%test%']);
    await DatabaseService.query('DELETE FROM strategy_executions WHERE strategy_id IN (SELECT id FROM strategies WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))', ['%test%']);
    await DatabaseService.query('DELETE FROM strategies WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%test%']);
    await DatabaseService.query('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%test%']);
    await DatabaseService.query('DELETE FROM user_settings WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%test%']);
    await DatabaseService.query('DELETE FROM users WHERE email LIKE $1', ['%test%']);
    
    // Clear Redis test data
    await RedisService.flushdb();
  } catch (error) {
    console.warn('Error during test cleanup:', error.message);
  }
}

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase timeout for integration tests
jest.setTimeout(60000);
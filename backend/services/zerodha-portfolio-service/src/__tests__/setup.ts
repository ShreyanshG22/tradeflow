import { DatabaseService } from '../services/DatabaseService';
import { RedisService } from '../services/RedisService';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tradeflow_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'password';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.ZERODHA_API_KEY = 'test_api_key';
process.env.ZERODHA_API_SECRET = 'test_api_secret';

// Global test setup
beforeAll(async () => {
  // Initialize test database connection
  try {
    await DatabaseService.initialize();
  } catch (error) {
    console.warn('Database not available for tests:', error);
  }

  // Initialize test Redis connection
  try {
    await RedisService.initialize();
  } catch (error) {
    console.warn('Redis not available for tests:', error);
  }
});

// Global test teardown
afterAll(async () => {
  try {
    await DatabaseService.close();
  } catch (error) {
    console.warn('Error closing database connection:', error);
  }

  try {
    await RedisService.close();
  } catch (error) {
    console.warn('Error closing Redis connection:', error);
  }
});

// Clean up between tests
afterEach(async () => {
  // Clean up test data if needed
  try {
    // Clear test data from database
    await DatabaseService.query('DELETE FROM zerodha_positions WHERE user_id LIKE $1', ['test-%']);
    await DatabaseService.query('DELETE FROM zerodha_holdings WHERE user_id LIKE $1', ['test-%']);
    await DatabaseService.query('DELETE FROM zerodha_portfolio_summary WHERE user_id LIKE $1', ['test-%']);
  } catch (error) {
    // Ignore cleanup errors in tests
  }
});
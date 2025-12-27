import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment variables if not already set
process.env.NODE_ENV = 'test';
process.env.ZERODHA_API_KEY = process.env.ZERODHA_API_KEY || 'test_api_key';
process.env.ZERODHA_API_SECRET = process.env.ZERODHA_API_SECRET || 'test_api_secret';
process.env.ZERODHA_REDIRECT_URL = process.env.ZERODHA_REDIRECT_URL || 'http://localhost:3000/auth/callback';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_only';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_encryption_key_32_characters';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

// Mock console methods in test environment
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Global test timeout
jest.setTimeout(10000);
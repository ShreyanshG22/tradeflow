import { execSync } from 'child_process';
import { Pool } from 'pg';
import Redis from 'ioredis';

export default async function globalSetup() {
  console.log('🔧 Setting up global test environment...');

  try {
    // Ensure test database exists
    await setupTestDatabase();
    
    // Ensure test Redis is available
    await setupTestRedis();
    
    // Run database migrations
    await runMigrations();
    
    // Start test services if needed
    await startTestServices();
    
    console.log('✅ Global test environment setup completed');
  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    process.exit(1);
  }
}

async function setupTestDatabase() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/tradeflow_test';
  
  try {
    const pool = new Pool({ connectionString: dbUrl });
    await pool.query('SELECT 1');
    await pool.end();
    console.log('✅ Test database connection verified');
  } catch (error) {
    console.log('⚠️ Test database not available, attempting to create...');
    
    try {
      // Try to create test database
      const adminDbUrl = dbUrl.replace('/tradeflow_test', '/postgres');
      const adminPool = new Pool({ connectionString: adminDbUrl });
      
      await adminPool.query('CREATE DATABASE tradeflow_test');
      await adminPool.end();
      
      console.log('✅ Test database created successfully');
    } catch (createError) {
      console.log('ℹ️ Test database may already exist or creation failed:', createError.message);
    }
  }
}

async function setupTestRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/1';
  
  try {
    const redis = new Redis(redisUrl);
    await redis.ping();
    await redis.flushdb(); // Clear test database
    await redis.quit();
    console.log('✅ Test Redis connection verified and cleared');
  } catch (error) {
    console.log('⚠️ Test Redis not available:', error.message);
    console.log('ℹ️ Some tests may fail without Redis');
  }
}

async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    
    // Run migrations using npm script or direct command
    execSync('npm run migrate', { 
      stdio: 'inherit',
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.log('⚠️ Migration failed or not available:', error.message);
    console.log('ℹ️ Attempting to create tables manually...');
    
    await createTestTables();
  }
}

async function createTestTables() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('⚠️ No database URL provided, skipping table creation');
    return;
  }

  try {
    const pool = new Pool({ connectionString: dbUrl });
    
    // Create essential tables for testing
    const tables = [
      `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) NOT NULL,
          zerodha_user_id VARCHAR(50),
          zerodha_access_token TEXT,
          zerodha_refresh_token TEXT,
          token_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          order_id VARCHAR(50) UNIQUE NOT NULL,
          exchange VARCHAR(10) NOT NULL,
          tradingsymbol VARCHAR(50) NOT NULL,
          transaction_type VARCHAR(10) NOT NULL,
          quantity INTEGER NOT NULL,
          product VARCHAR(10) NOT NULL,
          order_type VARCHAR(10) NOT NULL,
          price DECIMAL(10,2),
          trigger_price DECIMAL(10,2),
          status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
          filled_quantity INTEGER DEFAULT 0,
          average_price DECIMAL(10,2) DEFAULT 0,
          order_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_positions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          tradingsymbol VARCHAR(50) NOT NULL,
          exchange VARCHAR(10) NOT NULL,
          quantity INTEGER NOT NULL,
          average_price DECIMAL(10,2) NOT NULL,
          last_price DECIMAL(10,2),
          pnl DECIMAL(15,2),
          unrealised_pnl DECIMAL(15,2),
          realised_pnl DECIMAL(15,2),
          product VARCHAR(10) DEFAULT 'CNC',
          sector VARCHAR(50) DEFAULT 'Unknown',
          position_date DATE NOT NULL DEFAULT CURRENT_DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, tradingsymbol, exchange, position_date)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS zerodha_instruments (
          instrument_token BIGINT PRIMARY KEY,
          tradingsymbol VARCHAR(50) NOT NULL,
          name VARCHAR(200),
          exchange VARCHAR(10) NOT NULL,
          segment VARCHAR(10),
          lot_size INTEGER DEFAULT 1,
          tick_size DECIMAL(10,4) DEFAULT 0.05,
          instrument_type VARCHAR(10),
          expiry DATE,
          strike DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `
    ];

    for (const table of tables) {
      await pool.query(table);
    }

    await pool.end();
    console.log('✅ Test tables created successfully');
  } catch (error) {
    console.log('⚠️ Failed to create test tables:', error.message);
  }
}

async function startTestServices() {
  // Check if we need to start any test services
  const testPort = process.env.TEST_PORT || '3001';
  
  try {
    // Check if test server is already running
    const response = await fetch(`http://localhost:${testPort}/health`);
    if (response.ok) {
      console.log('✅ Test server already running');
      return;
    }
  } catch (error) {
    // Server not running, which is expected
  }

  // In a real setup, you might start the test server here
  // For now, we'll assume it's started by the test runner
  console.log('ℹ️ Test server will be started by individual test suites');
}